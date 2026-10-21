/* LocalWiki — ui/table-builder.js
   The "Insert table" / "Edit table" dialog for the Markdown editor: a grid of cells written back
   into the page as a Markdown table. Opened from the toolbar; edits the table at the caret or
   inserts a new one. Tables have no size limit; the grid scrolls. (In the Visual editor, tables
   are edited directly in the page instead.)

   Depends on: markdown.js, state.js, history.js, ui/elements.js, ui/page.js, ui/editor.js
   Provides:   LocalWiki.ui.openTableBuilder, installTableBuilder */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {currentPage, touchPage} = LW.store;
  const {findTableAt, lineOffset, tableMarkdown} = LW.markdown;
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
      values:[['Column 1','Column 2','Column 3'],['','',''],['','','']]
    };
    els.tableTitle.textContent = located ? 'Edit table' : 'Insert table';
    els.tableConfirm.textContent = located ? 'Update table' : 'Insert table';
    renderTableGrid(); els.tableDialog.showModal();
    els.tableGrid.querySelector('input')?.focus();
  }
  function renderTableGrid() {
    if (!tableDraft) return;
    const rows = tableDraft.values.length, cols = tableDraft.values[0].length;
    els.tableGrid.replaceChildren();
    els.tableGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(132px, 1fr))`;
    tableDraft.values.forEach((row, r) => row.forEach((value,c) => {
      const input = document.createElement('input'); input.type = 'text'; input.className = 'table-cell-input' + (r === 0 ? ' is-header':'');
      input.value = value;
      input.placeholder = r === 0 ? 'Column ' + (c+1) : 'Row ' + r + ', column ' + (c+1);
      input.setAttribute('aria-label', (r === 0 ? 'Header ' : 'Row ' + r + ', ') + 'column ' + (c+1));
      input.addEventListener('input', () => {tableDraft.values[r][c] = input.value;});
      els.tableGrid.append(input);
    }));
    els.tableSize.textContent = cols + ' column' + (cols===1?'':'s') + ' × ' + (rows-1) + ' data row' + (rows===2?'':'s');
    els.tableRemoveRow.disabled = rows <= 2;
    els.tableRemoveCol.disabled = cols <= 1;
  }
  // Writes the table into the page: replaces the edited table, or inserts a new one at the caret.
  function commitTable() {
    if (!tableDraft || !currentPage()) return;
    const md = tableMarkdown(tableDraft.values);
    const old = els.content.value;
    ui.ensureEditable();
    if (tableDraft.startLine !== null) {
      LW.history.record('editing a table');
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
