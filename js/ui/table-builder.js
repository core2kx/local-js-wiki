/* LocalWiki — ui/table-builder.js
   The "Insert table" / "Edit table" dialog for the Markdown editor: a grid of cells written back
   into the page as a Markdown table. Opened from the toolbar; edits the table at the caret or
   inserts a new one. Tables have no size limit; the grid scrolls. (In the Visual editor, tables
   are edited directly in the page instead.)

   Depends on: i18n.js, markdown.js, state.js, history.js, ui/elements.js, ui/page.js, ui/editor.js
   Provides:   LocalWiki.ui.openTableBuilder, installTableBuilder */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {t} = LW.i18n;
  const {currentPage, touchPage} = LW.store;
  const {findTableAt, lineOffset, tableMarkdown} = LW.markdown;
  const {memory, movePermutation, isIdentity, permute, planSort, planReset, sortState, tableKey} = LW.tableGrid;
  // {startLine, endLine, caret, values}: startLine is null for a new table; values[0] is the header.
  let tableDraft = null;

  // lineIndex: a source line inside the table to edit; null means "the table at the caret, if any".
  function openTableBuilder(lineIndex = null) {
    if (!currentPage()) return;
    const caret = els.content.selectionStart || 0;
    const caretLine = els.content.value.slice(0,caret).split('\n').length-1;
    const located = findTableAt(els.content.value, lineIndex === null ? caretLine : lineIndex);
    tableDraft = located ? {...located, caret} : {
      startLine:null, endLine:null, caret,
      values:[[1, 2, 3].map(n => t('table.column_n', {n})),['','',''],['','','']]
    };
    els.tableTitle.textContent = t(located ? 'table.title_edit' : 'table.title_insert');
    els.tableConfirm.textContent = t(located ? 'table.update' : 'table.title_insert');
    renderTableGrid(); els.tableDialog.showModal();
    els.tableGrid.querySelector('input')?.focus();
  }
  // --- Moving and sorting ---------------------------------------------------------------------------
  const sortKey = () => tableKey(currentPage()?.id || '', tableDraft.values[0]);
  function moveColumn(from, to) {
    const order = movePermutation(tableDraft.values[0].length, from, 1, to);
    if (isIdentity(order)) return;
    tableDraft.values = tableDraft.values.map(row => permute(row, order));
    renderTableGrid();
  }
  function moveRow(from, to) { // positions in values; row 0 is the header and stays first
    const order = movePermutation(tableDraft.values.length - 1, from - 1, 1, to - 1);
    if (isIdentity(order)) return;
    tableDraft.values = [tableDraft.values[0], ...permute(tableDraft.values.slice(1), order)];
    renderTableGrid();
  }
  function sortColumn(column) {
    const rows = tableDraft.values.slice(1);
    if (rows.length < 2) return;
    const {order} = planSort(memory, sortKey(), rows, column, LW.i18n.locale());
    tableDraft.values = [tableDraft.values[0], ...permute(rows, order)];
    renderTableGrid();
  }
  function resetSort() {
    const rows = tableDraft.values.slice(1), order = planReset(memory, sortKey(), rows);
    if (order) tableDraft.values = [tableDraft.values[0], ...permute(rows, order)];
    renderTableGrid();
  }
  function control(label, title, action, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'table-ctl-btn'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
    b.disabled = disabled; b.addEventListener('click', action);
    return b;
  }
  function renderTableGrid() {
    if (!tableDraft) return;
    const rows = tableDraft.values.length, cols = tableDraft.values[0].length;
    const state = sortState(memory, sortKey(), tableDraft.values.slice(1));
    els.tableGrid.replaceChildren();
    els.tableGrid.style.gridTemplateColumns = `34px repeat(${cols}, minmax(132px, 1fr))`;
    els.tableGrid.append(document.createElement('div'));
    for (let c = 0; c < cols; c++) {
      const bar = document.createElement('div'); bar.className = 'table-ctl';
      const mark = state && state.column === c ? (state.direction === 'asc' ? '▲' : '▼') : '⇅';
      bar.append(control('◀', t('table.move_left_tip'), () => moveColumn(c, c - 1), c === 0),
        control(mark, t('table.sort_col_tip'), () => sortColumn(c), rows < 3),
        control('▶', t('table.move_right_tip'), () => moveColumn(c, c + 2), c === cols - 1));
      els.tableGrid.append(bar);
    }
    tableDraft.values.forEach((row, r) => {
      const side = document.createElement('div'); side.className = 'table-ctl table-ctl-row';
      if (r > 0) side.append(control('▲', t('table.move_up_tip'), () => moveRow(r, r - 1), r === 1),
        control('▼', t('table.move_down_tip'), () => moveRow(r, r + 2), r === rows - 1));
      els.tableGrid.append(side);
      row.forEach((value, c) => {
        const input = document.createElement('input'); input.type = 'text'; input.className = 'table-cell-input' + (r === 0 ? ' is-header':'');
        input.value = value;
        input.placeholder = r === 0 ? t('table.column_n', {n: c + 1}) : t('table.cell', {row: r, col: c + 1});
        input.setAttribute('aria-label', r === 0 ? t('table.header_cell', {col: c + 1}) : t('table.cell', {row: r, col: c + 1}));
        input.addEventListener('input', () => {tableDraft.values[r][c] = input.value;});
        els.tableGrid.append(input);
      });
    });
    els.tableSize.textContent = t('table.size', {columns: t('table.columns', {count: cols}), rows: t('table.data_rows', {count: rows - 1})});
    els.tableRemoveRow.disabled = rows <= 2;
    els.tableRemoveCol.disabled = cols <= 1;
    els.tableResetSort.hidden = !state;
  }
  // Writes the table into the page: replaces the edited table, or inserts a new one at the caret.
  function commitTable() {
    if (!tableDraft || !currentPage()) return;
    const md = tableMarkdown(tableDraft.values);
    const old = els.content.value;
    ui.ensureEditable();
    if (tableDraft.startLine !== null) {
      LW.history.record('act.edit_table');
      const lines = old.split('\n');
      const start = lineOffset(lines,tableDraft.startLine);
      // A table can end at EOF; ensure we do not include unrelated text in the replacement.
      const end = tableDraft.endLine >= lines.length ? old.length : lineOffset(lines,tableDraft.endLine);
      const replacement = md + (end < old.length || old.slice(start,end).endsWith('\n') ? '\n' : '');
      els.content.setRangeText(replacement,start,end,'end');
      const page = currentPage(); page.content = els.content.value;
      touchPage(page); ui.renderMarkdown(); ui.renderPageStats(); ui.renderTreeIfSearching();
      els.content.focus();
    } else {
      const caret = tableDraft.caret;
      const prefix = caret && old[caret-1] !== '\n' ? '\n\n' : '';
      const suffix = caret < old.length && old[caret] !== '\n' ? '\n\n' : '\n';
      ui.insertAtCaret(prefix+md+suffix, caret);
    }
    tableDraft = null;
    els.tableDialog.close();
  }

  function installTableBuilder() {
    els.tableClose.addEventListener('click', () => els.tableDialog.close());
    els.tableCancel.addEventListener('click', () => els.tableDialog.close());
    els.tableConfirm.addEventListener('click', commitTable);
    els.tableResetSort.addEventListener('click', resetSort);
    els.tableExportCsv.addEventListener('click', () => ui.exportCsv(tableDraft.values));
    els.tableImportCsv.addEventListener('click', () => ui.importCsv(values => { tableDraft.values = values; renderTableGrid(); }));
    els.tableAddRow.addEventListener('click', () => {
      tableDraft.values.push(tableDraft.values[0].map(() => '')); renderTableGrid();
    });
    els.tableRemoveRow.addEventListener('click', () => {
      if (tableDraft.values.length <= 2) return;
      tableDraft.values.pop(); renderTableGrid();
    });
    els.tableAddCol.addEventListener('click', () => {
      tableDraft.values.forEach((row,idx) => row.push(idx === 0 ? 'Column ' + (row.length+1):''));
      renderTableGrid();
    });
    els.tableRemoveCol.addEventListener('click', () => {
      if (tableDraft.values[0].length <= 1) return;
      tableDraft.values.forEach(row => row.pop()); renderTableGrid();
    });
  }

  Object.assign(ui, {openTableBuilder, installTableBuilder});
})();
