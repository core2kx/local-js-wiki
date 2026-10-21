'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {search} = load('text', 'search');

const page = (title, content, tags = []) => ({id: title.toLowerCase(), title, content, tags});
const pages = [
  page('Travel log', 'Day one: Lisbon. On Friday we flew to Αθήνα and visited the Café Νέον.', ['trips', 'europe']),
  page('Lisbon trip', 'Planning notes for the Lisbon trip on Friday morning.'),
  page('Friday checklist', 'Pack bags.'),
  page('Lisbon', 'The city.')
];
const titles = raw => search.searchPages(pages, raw).matches.map(m => m.p.title);

test('every word must match, in any order', () => {
  assert.deepEqual(titles('lisbon friday'), ['Lisbon trip', 'Travel log']);
  assert.deepEqual(titles('friday lisbon'), ['Lisbon trip', 'Travel log']);
  assert.deepEqual(titles('lisbon portugal'), []);
});

test('quoted phrases match exactly, even while the quote is still open', () => {
  assert.deepEqual(search.searchTerms('"lisbon trip" europe'), ['lisbon trip', 'europe']);
  assert.deepEqual(titles('"lisbon trip"'), ['Lisbon trip']);
  assert.deepEqual(titles('"lisbon tr'), ['Lisbon trip']);
  assert.deepEqual(titles('""'), []);
});

test('ranking: exact title first, tags count, accents ignored', () => {
  assert.equal(titles('lisbon')[0], 'Lisbon');
  assert.deepEqual(titles('europe lisbon'), ['Travel log']);
  assert.deepEqual(titles('cafe αθηνα'), ['Travel log']);
});

test('snippets highlight every matched word in the original text', () => {
  const {terms, phrase, matches} = search.searchPages(pages, 'cafe αθηνα');
  const parts = search.snippetParts(matches[0].p, matches[0].body, terms, phrase);
  assert.deepEqual(parts.filter(p => p.mark).map(p => p.text), ['Αθήνα', 'Café']);
  assert.ok(parts.map(p => p.text).join('').startsWith('…'));
});
