/* LocalWiki — table-grid.js
   The rules for rearranging a table, kept free of any screen so both editors share them and the tests
   can check them. A table here is just rows of cell texts; every function that reorders returns a
   permutation, an array `order` where order[i] is the old position of the item that ends up at i.
   The editors apply that permutation to their own rows or cells (the Visual editor moves HTML cells,
   the table dialog moves strings), so formatting inside cells is never touched.

   Moving: movePermutation. Sorting: sortPermutation, with a small memory (planSort / planReset /
   sortState) of the order a table had before it was first sorted, so "Reset sort" can restore it.

   Depends on: nothing
   Provides:   LocalWiki.tableGrid */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});

  // --- Moving -------------------------------------------------------------------------------------
  // Moves `count` items starting at `first` so they sit before the item that is at `to` now
  // (to = length means the very end). Dropping a block onto itself changes nothing.
  function movePermutation(length, first, count, to) {
    const order = Array.from({length}, (_, i) => i);
    if (count < 1 || first < 0 || first + count > length || to < 0 || to > length) return order;
    if (to >= first && to <= first + count) return order;
    const block = order.splice(first, count);
    order.splice(to > first ? to - count : to, 0, ...block);
    return order;
  }
  const isIdentity = order => order.every((from, i) => from === i);
  const permute = (items, order) => order.map(from => items[from]);

  // --- Comparing cells ----------------------------------------------------------------------------
  // The number a cell holds, or null. Accepts 1 234,5 · 1,234.5 · -3 · 12% · $9.99 · €4,50.
  function numberOf(text) {
    let s = String(text).replace(/[\s  ]/g, '').replace(/^([-+]?)[$€£¥]/, '$1').replace(/[%$€£¥]$/, '');
    if (!/^[-+]?(\d|[.,]\d)[\d.,]*$/.test(s)) return null;
    const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (comma >= 0) s = /^[-+]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  // Only the unambiguous year-month-day form counts as a date.
  function dateOf(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(text).trim());
    if (!m) return null;
    const time = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return Number.isNaN(time) ? null : time;
  }
  // {rank, value}: blanks last; then numbers, dates, and text.
  function classify(text) {
    const s = String(text).trim();
    if (!s) return {rank: 3, value: ''};
    const n = numberOf(s); if (n !== null) return {rank: 0, value: n};
    const d = dateOf(s); if (d !== null) return {rank: 1, value: d};
    return {rank: 2, value: s};
  }
  function compareCells(a, b, collator) {
    const x = classify(a), y = classify(b);
    if (x.rank !== y.rank) return x.rank - y.rank;
    return x.rank === 2 ? collator.compare(x.value, y.value) : x.value === y.value ? 0 : x.value < y.value ? -1 : 1;
  }

  // --- Sorting ------------------------------------------------------------------------------------
  // The order of data rows (arrays of cell texts, header excluded) sorted by one column. Equal rows
  // keep their order; blank cells stay at the end in both directions.
  function sortPermutation(rows, column, direction = 'asc', locale) {
    const collator = new Intl.Collator(locale || undefined, {numeric: true, sensitivity: 'base'});
    const sign = direction === 'desc' ? -1 : 1;
    return rows.map((row, index) => index).sort((i, j) => {
      const a = rows[i][column] ?? '', b = rows[j][column] ?? '';
      const blankA = !String(a).trim(), blankB = !String(b).trim();
      if (blankA || blankB) return blankA === blankB ? i - j : blankA ? 1 : -1;
      return sign * compareCells(a, b, collator) || i - j;
    });
  }

  // --- Remembering the unsorted order -------------------------------------------------------------
  // Markdown cannot say what order a table "used to" have, so the editors remember it for the
  // session: memory is a Map from tableKey(...) to {original: row keys, column, direction}.
  const rowKey = cells => cells.map(cell => String(cell).trim()).join('\u001f');
  const tableKey = (pageId, headers) => pageId + '\u001e' + headers.map(h => String(h).trim()).join('\u001f');
  const sameRows = (a, b) => {
    if (a.length !== b.length) return false;
    const left = [...a].sort(), right = [...b].sort();
    return left.every((key, i) => key === right[i]);
  };
  // The remembered state if it still describes these rows (same rows, any order), else null.
  function sortState(memory, key, rows) {
    const memo = memory.get(key);
    return memo && sameRows(memo.original, rows.map(rowKey)) ? memo : null;
  }
  // Sorting by `column`: ascending the first time, then the other way each time the same column
  // is chosen again. Remembers the order the rows had before the first sort.
  // Returns {order, direction}.
  function planSort(memory, key, rows, column, locale) {
    let memo = sortState(memory, key, rows);
    const direction = memo && memo.column === column && memo.direction === 'asc' ? 'desc' : 'asc';
    if (!memo) { memo = {original: rows.map(rowKey)}; memory.set(key, memo); }
    memo.column = column; memo.direction = direction;
    return {order: sortPermutation(rows, column, direction, locale), direction};
  }
  // The order that puts the rows back as they were before sorting, or null when that is unknown.
  function planReset(memory, key, rows) {
    const memo = sortState(memory, key, rows);
    if (!memo) return null;
    const pool = new Map();
    rows.map(rowKey).forEach((rk, i) => pool.set(rk, [...(pool.get(rk) || []), i]));
    const order = memo.original.map(rk => pool.get(rk).shift());
    memory.delete(key);
    return order;
  }

  const memory = new Map(); // shared by the Visual editor and the table dialog
  LW.tableGrid = {memory, movePermutation, isIdentity, permute, numberOf, compareCells, sortPermutation, rowKey, tableKey, sortState, planSort, planReset};
})();
