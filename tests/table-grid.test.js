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
