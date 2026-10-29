/* LocalWiki — ui/visual-table.js
   Table tools of the Visual editor beyond adding and removing rows and columns: grips above the
   columns and beside the rows (click to select, shift-click to extend, drag to move), buttons that
   move the column or row with the caret, and sorting with a way back ("Reset sort").

   The grips are drawn over the page, not inside it, so they never become page content. Moving and
   sorting reorder the real HTML cells, so formatting inside cells stays; the page is then saved
   through the same path as typing. The rules (what a move or a sort does) are in table-grid.js.

   Depends on: i18n.js, state.js, history.js, table-grid.js, ui/elements.js, ui/visual-editor.js (hooks)
   Provides:   LocalWiki.ui.visualTable, installVisualTable */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {t} = LW.i18n;
  const {movePermutation, isIdentity, permute, planSort, planReset, sortState, tableKey} = LW.tableGrid;
  const GRIP = 16, DRAG_DISTANCE = 4;

  const memory = LW.tableGrid.memory; // the order tables had before they were sorted (see table-grid.js)
  let selection = null;        // {table, kind: 'col'|'row', first, count, anchor, cell}: the selected columns or rows
  let drag = null;             // a grip being pressed: {kind, index, x, y, moved, slot}
  let layer = null;            // the element that holds the grips and the drop marker
  const hooks = () => ui.visualHooks;

  // --- Reading a table ----------------------------------------------------------------------------
  const dataRows = table => [...table.rows].slice(1);
  const textsOf = row => [...row.cells].map(cell => cell.textContent.trim());
  const keyOf = table => tableKey(LW.store.currentPage()?.id || '', textsOf(table.rows[0]));
  const rowsOf = table => dataRows(table).map(textsOf);
  const columnOf = cell => Array.prototype.indexOf.call(cell.parentElement.children, cell);

  // --- Changing a table ---------------------------------------------------------------------------
  // One undo step per action. keepCell: the cell to put the caret back in (moving cells loses it).
  function edit(label, keepCell, action) {
    LW.history.record(label);
    if (action() === false) return;
    hooks().prepare();
    if (keepCell?.isConnected) hooks().placeCaret(keepCell, true);
    hooks().changed();
    paint();
  }
  function moveColumns(table, first, count, to, keepCell) {
    const order = movePermutation(table.rows[0].cells.length, first, count, to);
    if (isIdentity(order)) return;
    edit('act.move_col', keepCell, () => {
      for (const row of table.rows) {
        const cells = [...row.cells];
        if (cells.length === order.length) row.append(...permute(cells, order));
      }
      if (selection?.table === table) { selection.first = order.indexOf(first); selection.anchor = selection.first; }
    });
  }
  function moveRows(table, first, count, to, keepCell) { // first and to are positions in table.rows; row 0 is the header
    const rows = dataRows(table);
    if (!rows.length || first < 1 || to < 1) return;
    const order = movePermutation(rows.length, first - 1, count, to - 1);
    if (isIdentity(order)) return;
    edit('act.move_row', keepCell, () => {
      rows[0].parentElement.append(...permute(rows, order));
      if (selection?.table === table) { selection.first = order.indexOf(first - 1) + 1; selection.anchor = selection.first; }
    });
  }
  function sortBy(table, column, keepCell) {
    const rows = rowsOf(table);
    if (rows.length < 2) return;
    const {order} = planSort(memory, keyOf(table), rows, column, LW.i18n.locale());
    if (isIdentity(order)) { paint(); hooks().refreshBar(); return; }
    edit('act.sort_table', keepCell, () => {
      const body = dataRows(table);
      body[0].parentElement.append(...permute(body, order));
    });
  }
  function resetSort(table, keepCell) {
    const order = planReset(memory, keyOf(table), rowsOf(table));
    if (!order || isIdentity(order)) { paint(); hooks().refreshBar(); return; }
    edit('act.reset_sort', keepCell, () => {
      const body = dataRows(table);
      body[0].parentElement.append(...permute(body, order));
    });
  }
  function removeSelection(keepCell) {
    const {table, kind, first, count} = selection;
    if (kind === 'col') {
      if (count >= table.rows[0].cells.length) { selection = null; edit('act.delete_table', null, () => hooks().removeTable(table)); return; }
      edit('act.remove_col', keepCell, () => { for (const row of [...table.rows]) for (let i = 0; i < count; i++) row.cells[first]?.remove(); });
    } else {
      const rows = dataRows(table).slice(first - 1, first - 1 + count);
      const next = dataRows(table)[first - 1 + count] || dataRows(table)[first - 2] || table.rows[0];
      edit('act.remove_row', null, () => { rows.forEach(row => row.remove()); hooks().placeCaret(next.cells[0]); });
    }
    selection = null; paint(); hooks().refreshBar();
  }

  // --- Selecting ----------------------------------------------------------------------------------
  function select(table, kind, first, count, anchor = first) { selection = {table, kind, first, count, anchor, cell: caretCell()}; paint(); hooks().refreshBar(); }
  const caretCell = () => {
    const node = getSelection().rangeCount ? getSelection().getRangeAt(0).startContainer : null;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest('td, th') || null;
  };
  function selectedCells() {
    if (!selection) return [];
    const {table, kind, first, count} = selection;
    return kind === 'col'
      ? [...table.rows].flatMap(row => [...row.cells].slice(first, first + count))
      : [...table.rows].slice(first, first + count).flatMap(row => [...row.cells]);
  }
  // Marks the selected cells and the sort arrow, without touching the page content.
  function paint() {
    for (const marked of hooks().editor.querySelectorAll('.cell-selected')) marked.classList.remove('cell-selected');
    for (const cell of selectedCells()) cell.classList.add('cell-selected');
  }

  // --- Grips --------------------------------------------------------------------------------------
  function div(className, title) { const d = document.createElement('div'); d.className = className; if (title) d.title = title; return d; }
  function drawGrips(table) {
    layer.replaceChildren();
    const card = els.card.getBoundingClientRect(), box = table.getBoundingClientRect();
    const clip = (table.closest('.table-scroll') || table).getBoundingClientRect();
    const view = hooks().editor.getBoundingClientRect();
    const state = sortState(memory, keyOf(table), rowsOf(table));
    const header = [...table.rows[0].cells];
    if (box.top - GRIP >= view.top) header.forEach((cell, index) => {
      const r = cell.getBoundingClientRect();
      const left = Math.max(r.left, clip.left), right = Math.min(r.right, clip.right);
      if (right - left < 8) return;
      const grip = div('table-grip col' + (selection?.kind === 'col' && index >= selection.first && index < selection.first + selection.count ? ' is-selected' : ''), t('table.grip_col_tip'));
      grip.dataset.kind = 'col'; grip.dataset.index = index;
      Object.assign(grip.style, {left: left - card.left + 'px', top: box.top - card.top - GRIP + 'px', width: right - left + 'px', height: GRIP - 2 + 'px'});
      const sort = document.createElement('button');
      sort.type = 'button'; sort.className = 'grip-sort'; sort.tabIndex = -1; sort.title = t('table.sort_col_tip');
      sort.textContent = state && state.column === index ? (state.direction === 'asc' ? '▲' : '▼') : '⇅';
      if (state && state.column === index) sort.classList.add('is-active');
      grip.append(sort);
      layer.append(grip);
    });
    dataRows(table).forEach((row, i) => {
      const r = row.getBoundingClientRect(), index = i + 1;
      if (r.top < view.top || r.bottom > view.bottom) return;
      const grip = div('table-grip row' + (selection?.kind === 'row' && index >= selection.first && index < selection.first + selection.count ? ' is-selected' : ''), t('table.grip_row_tip'));
      grip.dataset.kind = 'row'; grip.dataset.index = index;
      Object.assign(grip.style, {left: Math.max(clip.left - card.left - GRIP, 0) + 'px', top: r.top - card.top + 'px', width: GRIP - 2 + 'px', height: r.height + 'px'});
      layer.append(grip);
    });
    layer.hidden = false;
  }
  // The slot a drag would drop into, and where to draw the marker for it.
  function dropSlot(table, event) {
    const card = els.card.getBoundingClientRect(), box = table.getBoundingClientRect();
    if (drag.kind === 'col') {
      const cells = [...table.rows[0].cells];
      const slot = cells.filter(cell => { const r = cell.getBoundingClientRect(); return (r.left + r.right) / 2 < event.clientX; }).length;
      const edge = slot < cells.length ? cells[slot].getBoundingClientRect().left : cells.at(-1).getBoundingClientRect().right;
      return {slot, style: {left: edge - card.left - 1 + 'px', top: box.top - card.top + 'px', width: '3px', height: box.height + 'px'}};
    }
    const rows = dataRows(table);
    const before = rows.filter(row => { const r = row.getBoundingClientRect(); return (r.top + r.bottom) / 2 < event.clientY; }).length;
    const edge = before < rows.length ? rows[before].getBoundingClientRect().top : rows.at(-1).getBoundingClientRect().bottom;
    return {slot: before + 1, style: {left: box.left - card.left + 'px', top: edge - card.top - 1 + 'px', width: box.width + 'px', height: '3px'}};
  }
  function showMarker(style) {
    let marker = layer.querySelector('.table-drop-line');
    if (!marker) { marker = div('table-drop-line'); layer.append(marker); }
    Object.assign(marker.style, style);
  }

  function onPointerDown(event) {
    const grip = event.target.closest('.table-grip');
    if (!grip || event.button > 0) return;
    event.preventDefault(); // the caret stays where it was
    if (event.target.closest('.grip-sort')) return;
    const table = hooks().currentTable();
    if (!table) return;
    drag = {table, kind: grip.dataset.kind, index: +grip.dataset.index, x: event.clientX, y: event.clientY, moved: false, slot: null, shift: event.shiftKey, cell: caretCell()};
    grip.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_DISTANCE) return;
      drag.moved = true;
      const inside = selection && selection.table === drag.table && selection.kind === drag.kind && drag.index >= selection.first && drag.index < selection.first + selection.count;
      if (!inside) select(drag.table, drag.kind, drag.index, 1);
    }
    const {slot, style} = dropSlot(drag.table, event);
    drag.slot = slot; showMarker(style);
  }
  function onPointerUp(event) {
    if (!drag) return;
    const done = drag; drag = null;
    layer.querySelector('.table-drop-line')?.remove();
    if (!done.moved) { // a click: select, or extend with Shift
      if (done.shift && selection?.table === done.table && selection.kind === done.kind) {
        const from = Math.min(selection.anchor, done.index), to = Math.max(selection.anchor, done.index);
        select(done.table, done.kind, from, to - from + 1, selection.anchor);
      } else select(done.table, done.kind, done.index, 1);
      return;
    }
    if (done.slot === null) return;
    (done.kind === 'col' ? moveColumns : moveRows)(done.table, selection.first, selection.count, done.slot, done.cell);
  }
  function onClick(event) {
    const sort = event.target.closest('.grip-sort');
    if (!sort) return;
    const table = hooks().currentTable();
    if (table) sortBy(table, +sort.parentElement.dataset.index, caretCell());
  }

  // --- Context bar --------------------------------------------------------------------------------
  const plural = (key, count) => t(key, {count});
  // Buttons for the table the caret is in. With columns or rows selected the bar is about the selection.
  function barButtons(cell, basic) {
    const button = hooks().button, table = cell.closest('table'), keep = cell;
    const sorted = !!sortState(memory, keyOf(table), rowsOf(table));
    const reset = sorted ? [button(t('table.reset_sort'), t('table.reset_sort_tip'), () => resetSort(table, keep))] : [];
    if (selection && selection.table === table) {
      const {kind, first, count} = selection;
      const label = Object.assign(document.createElement('span'), {className: 'context-label', textContent: t('table.selected', {what: plural(kind === 'col' ? 'table.columns' : 'table.data_rows', count)})});
      const last = kind === 'col' ? table.rows[0].cells.length : table.rows.length;
      const buttons = kind === 'col'
        ? [button(t('table.move_left'), t('table.move_left_tip'), () => first > 0 && moveColumns(table, first, count, first - 1, keep)),
           button(t('table.move_right'), t('table.move_right_tip'), () => first + count < last && moveColumns(table, first, count, first + count + 1, keep)),
           ...(count === 1 ? [button(t('table.sort'), t('table.sort_tip'), () => sortBy(table, first, keep))] : [])]
        : [button(t('table.move_up'), t('table.move_up_tip'), () => first > 1 && moveRows(table, first, count, first - 1, keep)),
           button(t('table.move_down'), t('table.move_down_tip'), () => first + count < last && moveRows(table, first, count, first + count + 1, keep))];
      return [label, ...buttons, ...reset, button(t(kind === 'col' ? 'table.remove_col' : 'table.remove_row'), t(kind === 'col' ? 'table.remove_col_tip' : 'table.remove_row_tip'), () => removeSelection(keep))];
    }
    const row = cell.parentElement, column = columnOf(cell), inHeader = row.parentElement.nodeName === 'THEAD';
    const at = [...table.rows].indexOf(row), columns = row.cells.length;
    return [...basic,
      button(t('table.move_left'), t('table.move_left_tip'), () => column > 0 && moveColumns(table, column, 1, column - 1, keep)),
      button(t('table.move_right'), t('table.move_right_tip'), () => column < columns - 1 && moveColumns(table, column, 1, column + 2, keep)),
      ...(inHeader ? [] : [
        button(t('table.move_up'), t('table.move_up_tip'), () => at > 1 && moveRows(table, at, 1, at - 1, keep)),
        button(t('table.move_down'), t('table.move_down_tip'), () => at < table.rows.length - 1 && moveRows(table, at, 1, at + 2, keep))]),
      button(t('table.sort'), t('table.sort_tip'), () => sortBy(table, column, keep)),
      ...reset];
  }

  // Called whenever the caret is (or is not) in a table: draws the grips and drops stale selections.
  function update(cell) {
    if (drag) return;
    if (!cell) { hide(); return; }
    const table = cell.closest('table');
    if (selection && (selection.table !== table || !selection.table.isConnected || (selection.cell && cell !== selection.cell))) selection = null;
    paint(); drawGrips(table);
  }
  function hide() { selection = null; drag = null; if (layer) { layer.hidden = true; layer.replaceChildren(); } paint(); }

  function installVisualTable() {
    layer = div('table-handles'); layer.hidden = true;
    els.card.append(layer);
    layer.addEventListener('pointerdown', onPointerDown);
    layer.addEventListener('pointermove', onPointerMove);
    layer.addEventListener('pointerup', onPointerUp);
    layer.addEventListener('pointercancel', () => { drag = null; layer.querySelector('.table-drop-line')?.remove(); });
    layer.addEventListener('click', onClick);
  }

  ui.visualTable = {barButtons, update, hide, hasSelection: () => !!selection};
  ui.installVisualTable = installVisualTable;
})();
