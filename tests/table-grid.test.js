'use strict';
/* Table moving, sorting and "reset sort": the pure rules in table-grid.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');

const {tableGrid: grid} = load('table-grid');
const apply = (items, order) => grid.permute(items, order);

test('movePermutation moves one item or a block to a slot', () => {
  assert.deepEqual(apply(['a', 'b', 'c', 'd'], grid.movePermutation(4, 0, 1, 3)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(apply(['a', 'b', 'c', 'd'], grid.movePermutation(4, 0, 1, 4)), ['b', 'c', 'd', 'a']);
  assert.deepEqual(apply(['a', 'b', 'c', 'd'], grid.movePermutation(4, 3, 1, 0)), ['d', 'a', 'b', 'c']);
  assert.deepEqual(apply(['a', 'b', 'c', 'd'], grid.movePermutation(4, 1, 2, 4)), ['a', 'd', 'b', 'c']);
});

test('dropping a block onto itself, or out of range, changes nothing', () => {
  for (const [first, count, to] of [[1, 2, 1], [1, 2, 2], [1, 2, 3], [0, 0, 2], [3, 2, 0], [0, 1, 9], [0, 1, -1]]) {
    assert.ok(grid.isIdentity(grid.movePermutation(4, first, count, to)), `${first},${count},${to}`);
  }
});

test('numbers sort as numbers, in several notations', () => {
  const rows = [['10'], ['9'], ['1 000'], ['2,5'], ['-3'], ['€4,50'], ['12%']];
  const sorted = apply(rows, grid.sortPermutation(rows, 0)).map(r => r[0]);
  assert.deepEqual(sorted, ['-3', '2,5', '€4,50', '9', '10', '12%', '1 000']);
  assert.equal(grid.numberOf('1,234.5'), 1234.5);
  assert.equal(grid.numberOf('1.234,5'), 1234.5);
  assert.equal(grid.numberOf('1,234'), 1234);
  assert.equal(grid.numberOf('abc'), null);
  assert.equal(grid.numberOf('3 apples'), null);
});

test('text sorts without regard to case, dates by date, blanks always last', () => {
  const words = [['pear'], ['Apple'], [''], ['banana']];
  assert.deepEqual(apply(words, grid.sortPermutation(words, 0, 'asc')).map(r => r[0]), ['Apple', 'banana', 'pear', '']);
  assert.deepEqual(apply(words, grid.sortPermutation(words, 0, 'desc')).map(r => r[0]), ['pear', 'banana', 'Apple', '']);
  const dates = [['2026-03-01'], ['2025-12-31'], ['2026-01-15']];
  assert.deepEqual(apply(dates, grid.sortPermutation(dates, 0)).map(r => r[0]), ['2025-12-31', '2026-01-15', '2026-03-01']);
});

test('numbers in text use natural order, and equal rows keep their order', () => {
  const rows = [['item 10', 'x'], ['item 2', 'y'], ['item 2', 'a']];
  assert.deepEqual(grid.sortPermutation(rows, 0), [1, 2, 0]);
});

test('a short row sorts as blank in the missing column', () => {
  const rows = [['b'], ['a', 'z'], ['c', 'y']];
  assert.deepEqual(grid.sortPermutation(rows, 1, 'asc'), [2, 1, 0]);
});

test('planSort alternates direction on the same column and Reset restores the first order', () => {
  const memory = new Map(), key = grid.tableKey('p1', ['Name', 'Qty']);
  let rows = [['pear', '3'], ['apple', '10'], ['fig', '2']];
  const original = rows.map(r => r.slice());
  let plan = grid.planSort(memory, key, rows, 1);
  assert.equal(plan.direction, 'asc');
  rows = apply(rows, plan.order);
  assert.deepEqual(rows.map(r => r[1]), ['2', '3', '10']);
  plan = grid.planSort(memory, key, rows, 1);
  assert.equal(plan.direction, 'desc');
  rows = apply(rows, plan.order);
  assert.deepEqual(rows.map(r => r[1]), ['10', '3', '2']);
  plan = grid.planSort(memory, key, rows, 0);
  assert.equal(plan.direction, 'asc', 'a different column starts ascending');
  rows = apply(rows, plan.order);
  const back = grid.planReset(memory, key, rows);
  assert.deepEqual(apply(rows, back), original);
  assert.equal(grid.planReset(memory, key, rows), null, 'nothing left to reset');
});

test('Reset works with duplicate rows, and is unavailable once rows were added or removed', () => {
  const memory = new Map(), key = grid.tableKey('p1', ['A']);
  let rows = [['x'], ['b'], ['x'], ['a']];
  rows = apply(rows, grid.planSort(memory, key, rows, 0).order);
  assert.deepEqual(rows.map(r => r[0]), ['a', 'b', 'x', 'x']);
  assert.deepEqual(apply(rows, grid.planReset(memory, key, rows)).map(r => r[0]), ['x', 'b', 'x', 'a']);

  rows = apply(rows, grid.planSort(memory, key, rows, 0).order);
  assert.ok(grid.sortState(memory, key, rows));
  assert.equal(grid.sortState(memory, key, [...rows, ['new']]), null);
  assert.equal(grid.planReset(memory, key, rows.slice(1)), null);
});

test('after rows change, sorting starts a new memory from the current order', () => {
  const memory = new Map(), key = grid.tableKey('p1', ['A']);
  let rows = [['b'], ['a']];
  rows = apply(rows, grid.planSort(memory, key, rows, 0).order);
  rows = [['z'], ...rows];
  const plan = grid.planSort(memory, key, rows, 0);
  assert.equal(plan.direction, 'asc');
  rows = apply(rows, plan.order);
  assert.deepEqual(apply(rows, grid.planReset(memory, key, rows)).map(r => r[0]), ['z', 'a', 'b']);
});

// --- CSV --------------------------------------------------------------------------------------------
test('parseDelimited handles quotes, doubled quotes, line breaks inside cells, CRLF and a BOM', () => {
  const text = '﻿name,note\r\n"Smith, J","says ""hi"""\r\n"two\nlines",x\r\n\r\n';
  assert.deepEqual(grid.parseDelimited(text, ','), [['name', 'note'], ['Smith, J', 'says "hi"'], ['two\nlines', 'x']]);
  assert.deepEqual(grid.parseDelimited('a;b\n1;2', ';'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(grid.parseDelimited('a,,"",d', ','), [['a', '', '', 'd']]);
  assert.deepEqual(grid.parseDelimited('', ','), []);
});

test('detectDelimiter chooses the separator of the first line, ignoring quoted text', () => {
  assert.equal(grid.detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(grid.detectDelimiter('Namn;Pris\nÄpple;1,5'), ';');
  assert.equal(grid.detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(grid.detectDelimiter('"a,b";c\n1;2'), ';');
  assert.equal(grid.detectDelimiter('single'), ',');
});

test('gridFromRows pads rows, flattens line breaks, and makes a header when there is none', () => {
  assert.deepEqual(grid.gridFromRows([['h1', 'h2', 'h3'], ['a', 'b'], ['x\ny']]), [['h1', 'h2', 'h3'], ['a', 'b', ''], ['x y', '', '']]);
  assert.deepEqual(grid.gridFromRows([['a', 'b'], ['c', 'd']], {header: false}), [['Column 1', 'Column 2'], ['a', 'b'], ['c', 'd']]);
  assert.deepEqual(grid.gridFromRows([['only', 'header']]), [['only', 'header'], ['', '']], 'a table always has a data row');
  assert.deepEqual(grid.gridFromRows([]), [['Column 1'], ['']]);
});

test('toCsv quotes only where needed, and what it writes parses back', () => {
  const values = [['Name', 'Note'], ['Smith, J', 'says "hi"'], [' padded ', 'plain'], ['', 'ä ö å']];
  const csv = grid.toCsv(values);
  assert.equal(csv.split('\r\n')[0], 'Name,Note');
  assert.equal(csv.split('\r\n')[2], '" padded ",plain');
  assert.deepEqual(grid.parseDelimited(csv, ','), values.filter(r => r.some(c => c.trim())));
  const semi = grid.toCsv([['a;b', 'c']], ';');
  assert.equal(semi, '"a;b";c\r\n');
  assert.deepEqual(grid.parseDelimited(grid.toCsv([['a\tb', 'c']], '\t'), '\t'), [['a\tb', 'c']]);
});

test('defaultDelimiter follows the decimal separator of the locale', () => {
  assert.equal(grid.defaultDelimiter('en'), ',');
  assert.equal(grid.defaultDelimiter('sv'), ';');
  assert.equal(grid.defaultDelimiter('de'), ';');
});

test('spreadsheetRows recognises copied cells and nothing else', () => {
  assert.deepEqual(grid.spreadsheetRows('a\tb\r\n1\t2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.equal(grid.spreadsheetRows('just text\nmore text'), null);
  assert.equal(grid.spreadsheetRows('a\tb'), null, 'one line is just text');
  assert.equal(grid.spreadsheetRows('a\tb\n1'), null, 'ragged');
  assert.equal(grid.spreadsheetRows('a\t"b\nc"\n1\t2'), null, 'quoted cells are left alone');
});
