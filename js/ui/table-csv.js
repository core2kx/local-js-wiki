/* LocalWiki — ui/table-csv.js
   CSV for tables: "Download CSV" saves a table as a file Excel can open, "Import CSV…" reads one
   (or a tab-separated text file) after showing a preview, and cells copied from a spreadsheet and
   pasted into the Markdown editor become a table. (Pasting into the Visual editor is in
   ui/visual-editor.js.) Both editors call exportCsv(values) and importCsv(apply); the rules for
   reading and writing CSV are in table-grid.js.

   Depends on: i18n.js, markdown.js, table-grid.js, storage.js, ui/elements.js, ui/editor.js
   Provides:   LocalWiki.ui.exportCsv, importCsv, installTableCsv */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {t} = LW.i18n;
  const {parseDelimited, detectDelimiter, gridFromRows, toCsv, defaultDelimiter, spreadsheetRows} = LW.tableGrid;
  const MAX_BYTES = 2 * 1024 * 1024, PREVIEW_ROWS = 6;

  let pending = null;   // {text, apply}: the file being imported and what to do with the result

  // values: rows of cell texts, header first. Saved as UTF-8 with a byte-order mark so that Excel
  // reads accented letters correctly; the separator follows the decimal mark of the computer's language.
  function exportCsv(values) {
    const separator = defaultDelimiter(globalThis.navigator?.language);
    const title = (LW.store.currentPage()?.title || 'table').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'table';
    LW.storage.downloadBlob(new Blob(['﻿' + toCsv(values, separator)], {type: 'text/csv;charset=utf-8'}), title + '.csv');
  }

  // The grid the dialog's current choices give, or null when the file holds no rows.
  function gridFromChoices() {
    const chosen = els.csvSeparator.value;
    const rows = parseDelimited(pending.text, chosen === 'auto' ? detectDelimiter(pending.text) : chosen);
    return rows.length ? gridFromRows(rows, {header: els.csvHeader.checked, label: n => t('table.column_n', {n})}) : null;
  }
  function renderPreview() {
    const grid = gridFromChoices();
    els.csvPreview.replaceChildren();
    els.csvConfirm.disabled = !grid;
    if (!grid) { els.csvSummary.textContent = t('csv.err_empty'); return; }
    pending.grid = grid;
    els.csvSummary.textContent = t('table.size', {columns: t('table.columns', {count: grid[0].length}), rows: t('table.data_rows', {count: grid.length - 1})});
    grid.slice(0, PREVIEW_ROWS).forEach((row, r) => {
      const tr = els.csvPreview.insertRow();
      for (const value of row) { const cell = document.createElement(r === 0 ? 'th' : 'td'); cell.textContent = value; tr.append(cell); }
    });
  }

  // Asks for a file, shows the preview, and calls apply(values) with the table the user confirms.
  function importCsv(apply) {
    pending = {text: '', apply, grid: null};
    els.csvFile.value = '';
    els.csvFile.click();
  }
  async function onFile() {
    const file = els.csvFile.files[0];
    if (!file || !pending) return;
    if (file.size > MAX_BYTES) { ui.toast(t('csv.err_large')); return; }
    try { pending.text = await file.text(); }
    catch (_) { ui.toast(t('csv.err_read')); return; }
    els.csvHeader.checked = true; els.csvSeparator.value = 'auto';
    renderPreview();
    els.csvDialog.showModal();
  }
  function confirm() {
    if (!pending?.grid) return;
    const {grid, apply} = pending;
    pending = null;
    els.csvDialog.close();
    apply(grid);
  }

  // Cells copied from a spreadsheet and pasted into the Markdown editor become a Markdown table.
  function onMarkdownPaste(event) {
    const rows = spreadsheetRows(event.clipboardData?.getData('text/plain') || '');
    if (!rows) return;
    const area = els.content, lines = area.value.slice(0, area.selectionStart).split('\n');
    const here = area.value.split('\n')[lines.length - 1];
    if (here.includes('|')) return; // inside a table already: paste the text as it is
    event.preventDefault();
    const caret = area.selectionStart;
    const md = LW.markdown.tableMarkdown(gridFromRows(rows, {label: n => t('table.column_n', {n})}));
    const prefix = caret && area.value[caret - 1] !== '\n' ? '\n\n' : '';
    const suffix = caret < area.value.length && area.value[caret] !== '\n' ? '\n\n' : '\n';
    ui.insertAtCaret(prefix + md + suffix, caret);
    ui.toast(t('toast.pasted_table'));
  }

  function installTableCsv() {
    els.csvFile.addEventListener('change', onFile);
    els.csvHeader.addEventListener('change', renderPreview);
    els.csvSeparator.addEventListener('change', renderPreview);
    els.csvConfirm.addEventListener('click', confirm);
    for (const close of [els.csvClose, els.csvCancel]) close.addEventListener('click', () => { pending = null; els.csvDialog.close(); });
    els.csvDialog.addEventListener('cancel', () => { pending = null; });
    els.content.addEventListener('paste', onMarkdownPaste);
  }

  Object.assign(ui, {exportCsv, importCsv, installTableCsv});
})();
