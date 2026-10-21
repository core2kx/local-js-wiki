'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {text} = load('text');

test('slug keeps each script readable and simplifies Latin accents', () => {
  const cases = {
    'Network Setup': 'network-setup',
    'Café Résumé': 'cafe-resume',
    'Tiếng Việt': 'tieng-viet',
    'Straße & Brücke': 'straße-brucke',
    'Привет мир': 'привет-мир',
    'Мой край': 'мой-край',          // й stays й
    'Ελληνικά άρθρα': 'ελληνικά-άρθρα',
    '東京の天気': '東京の天気',
    '서울 지하철': '서울-지하철',
    'שלום עולם': 'שלום-עולם',
    'नमस्ते दुनिया': 'नमस्ते-दुनिया',  // vowel signs kept
    'ｶﾀｶﾅ ＡＢＣ１２３': 'カタカナ-abc123', // half/full-width normalized
    'İstanbul': 'istanbul',
    '📌 Pinned ✓': 'pinned',
    'C++': 'c'
  };
  for (const [title, expected] of Object.entries(cases)) assert.equal(text.slug(title), expected, title);
});

test('slug falls back, avoids reserved names, and stays within filename limits', () => {
  assert.equal(text.slug('📌 ✓'), 'page');
  assert.equal(text.slug(''), 'page');
  assert.equal(text.slug('', 'my-wiki'), 'my-wiki');
  assert.equal(text.slug('con'), 'con-page');
  assert.equal(text.slug('x'.repeat(80)).length, 60);
  assert.ok(Buffer.byteLength(text.slug('中'.repeat(80))) <= 150);
  assert.ok(!text.slug('a'.repeat(59) + ' b').endsWith('-'));
});

test('titleKey matches titles case-insensitively on every machine', () => {
  const same = [['Straße', 'STRASSE'], ['ΟΔΟΣ', 'οδος'], ['Café', 'Café'], ['Привет', 'ПРИВЕТ']];
  for (const [a, b] of same) assert.equal(text.titleKey(a), text.titleKey(b), `${a} / ${b}`);
  assert.notEqual(text.titleKey('мой'), text.titleKey('мои'));
});

test('search folding ignores case and accents but keeps distinct letters', () => {
  const find = (query, haystack) => {
    const body = text.foldForSearch(haystack);
    const q = text.searchFold(query);
    const i = body.folded.indexOf(q);
    if (i < 0) return null;
    const [start, end] = text.originalRange(body, i, q.length);
    return haystack.slice(start, end);
  };
  assert.equal(find('cafe', 'Meet at the Café today'), 'Café');
  assert.equal(find('strasse', 'Hauptstraße 5'), 'straße');
  assert.equal(find('αθηνα', 'Ταξίδι στην Αθήνα'), 'Αθήνα');
  assert.equal(find('елка', 'Новогодняя ёлка'), 'ёлка');
  assert.equal(find('lodz', 'Łódź city'), 'Łódź');
  assert.equal(find('cafe', 'Café decomposed'), 'Café');
  assert.equal(find('abc', 'ＡＢＣ'), 'ＡＢＣ');
  assert.equal(find('мой', 'это мои книги'), null);
});

test('wordCount handles scripts without spaces', () => {
  assert.equal(text.wordCount('one two  three'), 3);
  assert.equal(text.wordCount(''), 0);
  assert.ok(text.wordCount('東京は日本の首都です') > 3);
});

test('graphemeBoundary never splits a character', () => {
  const s = 'ab👍🏽cd';
  assert.equal(text.graphemeBoundary(s, 3), 2); // inside the emoji -> its start
  assert.equal(text.graphemeBoundary(s, 0), 0);
});

test('escapeHtml escapes markup characters', () => {
  assert.equal(text.escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
