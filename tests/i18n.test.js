'use strict';
/* Interface languages: the translation core, language-file checking, and consistency between the
   English texts and the code that uses them (every key used exists, none is left unused, and each
   call gives the values its text needs). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./load');

const root = path.join(__dirname, '..');
const LW = load('i18n', 'lang/en');
const {i18n} = LW;

// A tiny second language for the behaviour tests (registered as an added language).
const sample = {
  language: {code: 'xx', name: 'Testish'},
  strings: {'common.cancel': 'Avbryt', 'count.pages': {one: '{count} sida', other: '{count} sidor'}, 'top.undo_with': 'Ångra: {action}'}
};

test('t() fills placeholders, formats numbers and picks plural forms', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('common.cancel'), 'Cancel');
  assert.equal(i18n.t('count.pages', {count: 1}), '1 page');
  assert.equal(i18n.t('count.pages', {count: 3}), '3 pages');
  assert.equal(i18n.t('count.pages', {count: 12345}), '12,345 pages');
  assert.equal(i18n.t('top.brand_home', {name: 'Acme'}), 'Acme home');
  assert.equal(i18n.t('top.brand_home'), '{name} home', 'a missing value leaves the placeholder visible');
  assert.equal(i18n.t('no.such.key'), 'no.such.key', 'a missing key shows the key');
});

test('values can be translatable messages, and lists of them', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('top.undo_with', {action: {key: 'act.rename', params: {title: 'Intro'}}}), 'Undo: Renaming “Intro”');
  assert.equal(i18n.t('prob.repaired', {notes: [{key: 'page.note_no_title'}, {key: 'page.note_no_content'}]}),
    'Repaired: it had no title, so the filename is used; it had no “content”. The fix will be written on the next save.');
});

test('a language falls back to English for anything it lacks', () => {
  i18n.register(sample, {custom: true});
  i18n.setLanguage('xx');
  assert.equal(i18n.t('common.cancel'), 'Avbryt');
  assert.equal(i18n.t('count.pages', {count: 2}), '2 sidor');
  assert.equal(i18n.t('common.close'), 'Close', 'not translated: English');
  assert.equal(i18n.t('top.undo_with', {action: {key: 'act.typing'}}), 'Ångra: Typing', 'nested text uses the same fallback');
  i18n.unregister('xx');
  assert.equal(i18n.language(), 'en', 'removing the language in use falls back to English');
});

test('an added language can override a built-in one, and removing it brings the built-in back', () => {
  const builtIn = {language: {code: 'yy', name: 'Builtish'}, strings: {'common.cancel': 'Built-in cancel'}};
  i18n.register(builtIn);
  i18n.register({language: {code: 'yy', name: 'Mine'}, strings: {'common.cancel': 'My cancel'}}, {custom: true});
  i18n.setLanguage('yy');
  assert.equal(i18n.t('common.cancel'), 'My cancel');
  assert.deepEqual(i18n.list().find(l => l.code === 'yy'), {code: 'yy', name: 'Mine', direction: 'ltr', custom: true});
  i18n.unregister('yy');
  assert.equal(i18n.t('common.cancel'), 'Built-in cancel');
  assert.equal(i18n.get('yy').custom, false);
  i18n.setLanguage('en');
});

test('detect() picks the browser language when there is a matching one', () => {
  i18n.register({language: {code: 'sv', name: 'Svenska'}, strings: {}});
  i18n.register({language: {code: 'nb', name: 'Norsk'}, strings: {}});
  assert.equal(i18n.detect(['sv-SE', 'en']), 'sv');
  assert.equal(i18n.detect(['de', 'nb-NO']), 'nb', 'the first language that exists wins');
  assert.equal(i18n.detect(['no']), 'nb');
  assert.equal(i18n.detect(['nn-NO']), 'nb');
  assert.equal(i18n.detect(['ja']), 'en');
  assert.equal(i18n.detect([]), 'en');
  i18n.unregister('sv'); i18n.unregister('nb');
});

test('KeyError carries a translatable message', () => {
  const err = i18n.error('err.version', {version: 9});
  assert.ok(err instanceof Error && err.name === 'KeyError');
  assert.equal(i18n.describeError(err), 'Unsupported wiki.json version: 9');
  assert.equal(i18n.describeError(new Error('plain')), 'plain');
});

test('parseFile accepts a good file and reports how much is translated', () => {
  const result = i18n.parseFile(JSON.stringify({language: {code: 'SV', name: ' Svenska '}, strings: {'common.cancel': 'Avbryt', 'common.close': '', 'unknown.key': 'x', 'count.pages': {one: '{count} sida', other: '{count} sidor'}}}));
  assert.deepEqual(result.errors, []);
  assert.equal(result.file.language.code, 'sv');
  assert.equal(result.file.language.name, 'Svenska');
  assert.deepEqual(Object.keys(result.file.strings), ['common.cancel', 'count.pages'], 'unknown and empty entries are dropped');
  assert.equal(result.translated, 2);
  assert.equal(result.total, Object.keys(i18n.get('en').strings).length);
  assert.equal(result.missing.length, result.total - 2);
  assert.deepEqual(result.warnings.map(w => w.key), ['lang.warn_unknown']);
});

test('parseFile rejects files that cannot be used, with a reason', () => {
  const first = text => i18n.parseFile(text).errors[0]?.key;
  assert.equal(first('{ not json'), 'lang.err_json');
  assert.equal(first('[]'), 'lang.err_shape');
  assert.equal(first('{"language": {"code": "sv"}}'), 'lang.err_shape');
  assert.equal(first('{"language": {"code": ""}, "strings": {}}'), 'lang.err_code');
  assert.equal(first('{"language": {"code": "../etc"}, "strings": {}}'), 'lang.err_code');
  assert.equal(first('{"language": {"code": "en"}, "strings": {}}'), 'lang.err_base');
  assert.equal(i18n.parseFile('﻿{"language": {"code": "sv"}, "strings": {}}').errors.length, 0, 'a byte-order mark is fine');
});

test('JSON syntax errors say where the problem is', () => {
  const text = '{\n  "language": {"code": "sv"},\n  "strings": {\n    "a": "b",\n  }\n}';
  const {errors} = i18n.parseFile(text);
  assert.equal(errors[0].key, 'lang.err_json');
  assert.match(errors[0].params.error, /line \d+/);
});

test('parseFile checks placeholders', () => {
  const file = strings => i18n.parseFile({language: {code: 'sv'}, strings});
  const stray = file({'top.undo_with': 'Ångra: {thing}'});
  assert.ok(!stray.file.strings['top.undo_with'], 'a text with a placeholder it does not have is ignored');
  assert.equal(stray.warnings[0].key, 'lang.warn_stray');
  const missing = file({'top.undo_with': 'Ångra'});
  assert.equal(missing.file.strings['top.undo_with'], 'Ångra', 'a missing placeholder is only a warning');
  assert.equal(missing.warnings[0].key, 'lang.warn_missing_placeholder');
  const plural = file({'count.pages': {one: 'En sida', other: '{count} sidor'}});
  assert.deepEqual(plural.warnings, [], 'a plural form may leave out {count}');
  assert.equal(file({'common.cancel': 42}).warnings[0].key, 'lang.warn_malformed');
  assert.equal(file({'count.pages': {few: 'x', many: 3}}).warnings[0].key, 'lang.warn_malformed');
});

test('right-to-left languages are accepted with a warning', () => {
  const result = i18n.parseFile({language: {code: 'ar', direction: 'rtl'}, strings: {}});
  assert.equal(result.file.language.direction, 'rtl');
  assert.equal(result.warnings[0].key, 'lang.warn_rtl');
});

test('the template and the export carry every English text', () => {
  const english = i18n.get('en').strings;
  assert.deepEqual(Object.keys(i18n.template().strings), Object.keys(english));
  i18n.register(sample, {custom: true});
  const exported = i18n.exportFile('xx');
  assert.equal(exported.strings['common.cancel'], 'Avbryt');
  assert.equal(exported.strings['common.close'], 'Close', 'untranslated texts are filled with English');
  assert.ok(exported.untranslated.includes('common.close') && !exported.untranslated.includes('common.cancel'));
  assert.equal(exported.language.code, 'xx');
  i18n.unregister('xx');
});

// --- Consistency between the English texts and the code ----------------------------------------------
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const english = JSON.parse(read('languages/en.json'));
const keys = Object.keys(english.strings);
const groups = new Set(keys.map(key => key.split('.')[0]));
const sources = ['index.html', ...['js', 'js/ui'].flatMap(dir => fs.readdirSync(path.join(root, dir))
  .filter(name => name.endsWith('.js')).map(name => `${dir}/${name}`))];
// Keys named with a computed part, checked from data instead.
const DYNAMIC_GROUPS = new Set(['icon', 'palette']);

function usedKeys() {
  const used = new Map(); // key -> files
  const note = (key, file) => { if (!used.has(key)) used.set(key, new Set()); used.get(key).add(file); };
  for (const file of sources) {
    const text = read(file);
    if (file === 'index.html') { for (const m of text.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)) note(m[1], file); continue; }
    for (const m of text.matchAll(/['"`]([a-z]+(?:\.[a-z0-9_]+)+)['"`]/g)) if (groups.has(m[1].split('.')[0])) note(m[1], file);
  }
  return used;
}

test('every key used in index.html or the code exists in languages/en.json', () => {
  const missing = [...usedKeys()].filter(([key]) => !(key in english.strings) && !/^(page|file|wiki)\.json$/.test(key))
    .map(([key, files]) => `${key} (${[...files].join(', ')})`);
  assert.deepEqual(missing, []);
});

test('no English text is left unused', () => {
  const used = usedKeys();
  const unused = keys.filter(key => !DYNAMIC_GROUPS.has(key.split('.')[0]) && !used.has(key));
  assert.deepEqual(unused, []);
});

test('icon and palette names exist for every icon and palette', () => {
  const {icons, palettes} = load('icon-library', 'palettes');
  const missing = [...icons.items.map(i => 'icon.' + i.name), ...palettes.list.map(p => 'palette.' + p.id)].filter(key => !(key in english.strings));
  assert.deepEqual(missing, []);
  const extra = keys.filter(k => k.startsWith('icon.') && !icons.items.some(i => 'icon.' + i.name === k));
  assert.deepEqual(extra, []);
});

// Source text of the {...} literal starting at/after position `from`, or null when there is none.
function objectLiteral(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') { for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++; continue; }
    if ('{(['.includes(ch)) depth++;
    if ('})]'.includes(ch)) { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}
// The names of the values in an object literal's source: "a, b: 1, c: t('x', {y})" -> [a, b, c].
function propertyNames(source) {
  const names = [];
  let depth = 0, segment = '';
  const flush = () => { const m = /^\s*([\w$]+)/.exec(segment); if (m) names.push(m[1]); segment = ''; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      segment += ch;
      for (i++; i < source.length && source[i] !== ch; i++) { segment += source[i]; if (source[i] === '\\') segment += source[++i]; }
      segment += ch; continue;
    }
    if ('{(['.includes(ch)) depth++;
    if ('})]'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { flush(); continue; }
    segment += ch;
  }
  flush();
  return names;
}
test('every t() call gives the values its English text needs', () => {
  const problems = [];
  for (const file of sources.filter(f => f.endsWith('.js'))) {
    const text = read(file);
    for (const m of text.matchAll(/\bt\('([a-z]+(?:\.[a-z0-9_]+)+)'(\s*,)?/g)) {
      const value = english.strings[m[1]];
      if (value === undefined) continue;
      const needed = new Set((typeof value === 'object' ? Object.values(value) : [value]).flatMap(s => [...s.matchAll(/\{(\w+)\}/g)].map(x => x[1])));
      if (!needed.size) continue;
      const literal = m[2] ? objectLiteral(text, m.index + m[0].length) : null;
      const given = literal === null ? [] : propertyNames(literal);
      const lacking = [...needed].filter(name => !given.includes(name));
      if (lacking.length) problems.push(`${file}: t('${m[1]}') lacks ${lacking.join(', ')}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('placeholders in plural forms and the English text agree', () => {
  for (const [key, value] of Object.entries(english.strings)) {
    if (typeof value !== 'object') continue;
    assert.ok(Object.keys(value).every(form => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(form)) && value.other, key);
  }
});

test('the generated js/lang scripts are up to date with languages/*.json', () => {
  const {build} = require('../tools/build-languages.js');
  assert.deepEqual(build({check: true}).problems, []);
});

// Shipped languages: every languages/<code>.json (other than the English master) must be complete
// and clean, so a missing or misspelled text is caught before it reaches anyone.
const shipped = fs.readdirSync(path.join(root, 'languages')).filter(name => name.endsWith('.json') && name !== 'en.json');
const masterStrings = JSON.parse(fs.readFileSync(path.join(root, 'languages', 'en.json'), 'utf8')).strings;

test('the shipped languages are the expected ones', () => {
  assert.deepEqual(shipped.map(name => name.replace('.json', '')).sort(), ['da', 'de', 'es', 'fi', 'fr', 'nb', 'pl', 'sv']);
});

for (const name of shipped) {
  test(`shipped language ${name} is complete, with no warnings`, () => {
    const result = i18n.parseFile(fs.readFileSync(path.join(root, 'languages', name), 'utf8'));
    assert.deepEqual(result.errors, [], 'errors');
    assert.deepEqual(result.warnings, [], 'warnings');
    const strings = JSON.parse(fs.readFileSync(path.join(root, 'languages', name), 'utf8')).strings;
    assert.deepEqual(Object.keys(masterStrings).filter(key => !(key in strings)), [], 'untranslated keys');
    assert.deepEqual(Object.keys(strings).filter(key => !(key in masterStrings)), [], 'unknown keys');
    for (const [key, value] of Object.entries(strings)) {
      if (typeof value === 'string') { assert.ok(value.trim(), `${key} is empty`); continue; }
      assert.ok(typeof value.other === 'string', `${key} has no "other" form`);
    }
  });
}

test('Polish has all plural forms for counted texts', () => {
  const strings = JSON.parse(fs.readFileSync(path.join(root, 'languages', 'pl.json'), 'utf8')).strings;
  for (const [key, value] of Object.entries(masterStrings)) {
    if (typeof value !== 'object') continue;
    for (const form of ['one', 'few', 'many', 'other']) assert.ok(strings[key][form], `${key}.${form}`);
  }
});
