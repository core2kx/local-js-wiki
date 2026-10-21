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

// --- The link dialog's page picker ---
const picks = [
  page('Switch inventory', '', ['inventory', 'hardware']),
  page('StackWise stacks', '', ['stacking']),
  page('Troubleshooting runbook', '', []),
  page('IOS XE upgrade procedure', '', ['upgrade']),
  page('Café notes', '', []),
  page('Hardware models', '', [])
];
const pickTitles = raw => search.pickPages(picks, raw).results.map(r => r.p.title);

test('picker: an empty query lists every page alphabetically', () => {
  assert.deepEqual(pickTitles(''), ['Café notes', 'Hardware models', 'IOS XE upgrade procedure', 'StackWise stacks', 'Switch inventory', 'Troubleshooting runbook']);
  assert.equal(pickTitles('   ').length, 6);
});

test('picker: matches titles and tags, ignoring case and accents, every word required', () => {
  assert.deepEqual(pickTitles('STACK'), ['StackWise stacks']);
  assert.deepEqual(pickTitles('cafe'), ['Café notes']);
  assert.deepEqual(pickTitles('upgrade ios'), ['IOS XE upgrade procedure']);
  assert.deepEqual(pickTitles('hardware'), ['Hardware models', 'Switch inventory']); // title match first, then tag match
  assert.deepEqual(pickTitles('nonsense'), []);
});

test('picker: a title that starts a word ranks above one that merely contains it', () => {
  const pagesList = [page('Catalog', '', []), page('Cat tools', '', []), page('Education', '', [])];
  // "Education" contains "cat" in the middle of a word, so it is listed, but last.
  assert.deepEqual(search.pickPages(pagesList, 'cat').results.map(r => r.p.title), ['Cat tools', 'Catalog', 'Education']);
  // Alphabetically "Bobcat guide" comes first, but "Catalog" starts a word with the term, so it wins.
  assert.deepEqual(search.pickPages([page('Bobcat guide', '', []), page('Catalog', '', [])], 'cat').results.map(r => r.p.title), ['Catalog', 'Bobcat guide']);
  // An exact title match beats everything.
  assert.deepEqual(search.pickPages([page('Cat tools', '', []), page('Cat', '', [])], 'cat').results.map(r => r.p.title), ['Cat', 'Cat tools']);
});

test('picker: title parts mark the matches in the original text', () => {
  const marked = raw => search.pickPages(picks, raw).results[0].parts.filter(p => p.mark).map(p => p.text);
  assert.deepEqual(marked('stack'), ['Stack', 'stack']);
  assert.deepEqual(marked('cafe'), ['Café']);
  const parts = search.titleParts('Switch inventory', ['switch', 'itch']); // overlapping matches merge
  assert.deepEqual(parts, [{text: 'Switch', mark: true}, {text: ' inventory', mark: false}]);
  assert.equal(search.pickPages(picks, '').results[0].parts.map(p => p.text).join(''), 'Café notes');
});

test('snippets highlight every matched word in the original text', () => {
  const {terms, phrase, matches} = search.searchPages(pages, 'cafe αθηνα');
  const parts = search.snippetParts(matches[0].p, matches[0].body, terms, phrase);
  assert.deepEqual(parts.filter(p => p.mark).map(p => p.text), ['Αθήνα', 'Café']);
  assert.ok(parts.map(p => p.text).join('').startsWith('…'));
});
