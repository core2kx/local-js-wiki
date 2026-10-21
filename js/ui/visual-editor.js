/* LocalWiki — ui/visual-editor.js
   The Visual view: the page shown formatted and edited in place (an HTML "contenteditable" area).
   The page is still stored as Markdown: the area is filled from markdown.toHtml, and after every
   change it is converted back with htmlToMarkdown and saved through pages.editContent (so undo,
   autosave, renames and history work exactly as with the Markdown editor).

   Toolbar buttons format the selection. A small context bar appears for links (Open, Edit,
   Remove) and inside tables (add/remove rows and columns, delete the table). Paste inserts plain
   text, so formatting from other sites cannot sneak in.

   Depends on: model.js, markdown.js, html-to-markdown.js, state.js, history.js, pages.js,
               ui/elements.js
   Provides:   LocalWiki.ui.renderVisual, visualFormat, visualInsertText, visualInsertIcon,
               saveVisualSelection, installVisualEditor */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {currentPage} = LW.store;
  const {findLinkTarget} = LW.model;
  const BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre';

  let shown = null;        // {id, content} the area currently displays
  let savedRange = null;   // selection kept while a dialog or prompt has the focus

  const linkExists = target => !!findLinkTarget(state.wiki.pages, target);
  const editor = () => els.visual;

  // --- Showing the page ---------------------------------------------------------------------------
  // force: redraw even if the content looks unchanged (e.g. another page was selected).
  function renderVisual(force = false) {
    const page = currentPage();
    if (!page) { editor().innerHTML = ''; shown = null; hideBar(); return; }
    if (!force && shown && shown.id === page.id && shown.content === page.content) return;
    editor().innerHTML = LW.markdown.toHtml(page.content, {linkExists});
    prepare();
    shown = {id: page.id, content: page.content};
    hideBar();
  }
  // Icons are single, uneditable characters; a trailing empty paragraph lets the caret get below
  // a final table or code block.
  function prepare() {
    for (const icon of editor().querySelectorAll('.inline-wiki-icon')) icon.contentEditable = 'false';
    const last = editor().lastElementChild;
    if (last && (last.matches('.table-block, pre, hr, blockquote, ul, ol'))) {
      const p = document.createElement('p'); p.append(document.createElement('br')); editor().append(p);
    }
  }
  // After any edit: convert to Markdown and save it like typing in the Markdown editor.
  function changed() {
    const page = currentPage(); if (!page) return;
    const markdown = LW.htmlToMarkdown(editor());
    shown = {id: page.id, content: markdown};
    if (markdown === page.content) { updateBar(); return; }
    els.content.value = markdown; // keep the Markdown view in step (Split shows both)
    LW.pages.editContent(markdown);
    updateBar();
  }

  // --- Selection helpers --------------------------------------------------------------------------
  function selectionRange() {
    const selection = getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editor().contains(range.commonAncestorContainer) ? range : null;
  }
  function saveVisualSelection() { const range = selectionRange(); savedRange = range ? range.cloneRange() : null; }
  function restoreSelection() {
    editor().focus();
    if (!savedRange) return;
    const selection = getSelection();
    selection.removeAllRanges(); selection.addRange(savedRange);
  }
  const closestIn = (node, selector) => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const found = element?.closest(selector);
    return found && editor().contains(found) ? found : null;
  };
  // The direct child of the editor that contains the caret.
  function topBlock(node) {
    let n = node?.nodeType === 1 ? node : node?.parentElement;
    while (n && n.parentElement !== editor()) n = n.parentElement;
    return n && n.parentElement === editor() ? n : null;
  }
  function placeCaret(node, atEnd = false) {
    const range = document.createRange();
    range.selectNodeContents(node); range.collapse(!atEnd);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }
  const exec = (command, value = null) => document.execCommand(command, false, value);

  // --- Toolbar ------------------------------------------------------------------------------------
  // kind: a toolbar button's data-format value. Each action is one undo step.
  function visualFormat(kind) {
    if (!currentPage()) return;
    editor().focus();
    if (!selectionRange()) placeCaret(editor(), true);
    LW.history.record('formatting');
    switch (kind) {
      case 'heading': toggleBlock('H2'); break;
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'list': exec('insertUnorderedList'); break;
      case 'olist': exec('insertOrderedList'); break;
      case 'quote': toggleBlock('BLOCKQUOTE'); break;
      case 'codeblock': toggleBlock('PRE'); break;
      case 'code': inlineCode(); break;
      case 'link': insertLink(false); break;
      case 'wiki': insertLink(true); break;
      case 'table': insertTable(); break;
      default: return;
    }
    changed();
  }
  function toggleBlock(tag) {
    const block = closestIn(selectionRange()?.startContainer, BLOCK_SELECTOR);
    exec('formatBlock', block && block.nodeName === tag ? 'P' : tag);
  }
  function inlineCode() {
    const range = selectionRange(); if (!range) return;
    const inside = closestIn(range.startContainer, 'code');
    if (inside && !closestIn(range.startContainer, 'pre')) { inside.replaceWith(...inside.childNodes); return; } // toggle off
    const code = document.createElement('code');
    code.textContent = range.collapsed ? 'code' : range.toString();
    range.deleteContents(); range.insertNode(code);
    if (range.collapsed) placeCaret(code); else { const after = document.createRange(); after.setStartAfter(code); after.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(after); }
  }
  function insertLink(wiki) {
    saveVisualSelection();
    const selected = savedRange ? savedRange.toString().trim() : '';
    const target = prompt(wiki ? 'Link to page (title):' : 'Link address:', wiki ? selected : 'https://');
    restoreSelection();
    if (!target || !target.trim() || (!wiki && !/^(https?:\/\/|mailto:)/i.test(target.trim()))) {
      if (target && !wiki) ui.toast('Links must start with http://, https:// or mailto:');
      return;
    }
    const range = selectionRange(); if (!range) return;
    const a = document.createElement('a');
    if (wiki) {
      a.href = '#'; a.className = 'wiki-link' + (linkExists(target.trim()) ? '' : ' missing-link');
      a.dataset.wikiTarget = target.trim();
    } else {
      a.href = target.trim(); a.target = '_blank'; a.rel = 'noopener noreferrer';
    }
    a.textContent = selected || target.trim();
    range.deleteContents(); range.insertNode(a);
    const after = document.createRange(); after.setStartAfter(a); after.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(after);
  }
  function emptyRow(cells, header = false) {
    const tr = document.createElement('tr');
    for (let i = 0; i < cells; i++) {
      const cell = document.createElement(header ? 'th' : 'td');
      if (header) cell.textContent = 'Column ' + (i + 1); else cell.append(document.createElement('br'));
      tr.append(cell);
    }
    return tr;
  }
  // A new 3 × 2 table after the block with the caret (replacing it if it is empty).
  function insertTable() {
    const block = topBlock(selectionRange()?.startContainer);
    const wrapper = document.createElement('div'); wrapper.className = 'table-block';
    const scroll = document.createElement('div'); scroll.className = 'table-scroll';
    const table = document.createElement('table');
    const thead = document.createElement('thead'), tbody = document.createElement('tbody');
    thead.append(emptyRow(3, true)); tbody.append(emptyRow(3), emptyRow(3));
    table.append(thead, tbody); scroll.append(table); wrapper.append(scroll);
    if (block && !block.textContent.trim() && !block.querySelector('.inline-wiki-icon') && block.nodeName === 'P') block.replaceWith(wrapper);
    else if (block) block.after(wrapper);
    else editor().append(wrapper);
    prepare();
    placeCaret(thead.querySelector('th'), true);
  }

  // --- Inserting from the picker ------------------------------------------------------------------
  function visualInsertText(text) {
    restoreSelection();
    LW.history.record('inserting text');
    exec('insertText', text);
    changed();
  }
  function visualInsertIcon(name) {
    if (!LW.icons.has(name)) return;
    restoreSelection();
    LW.history.record('inserting an icon');
    const span = document.createElement('span');
    span.className = 'inline-wiki-icon'; span.setAttribute('role', 'img'); span.setAttribute('aria-label', name);
    span.dataset.icon = name; span.contentEditable = 'false'; span.innerHTML = LW.icons.svg(name);
    const range = selectionRange() || (() => { const r = document.createRange(); r.selectNodeContents(editor()); r.collapse(false); return r; })();
    range.deleteContents(); range.insertNode(span);
    const after = document.createRange(); after.setStartAfter(span); after.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(after);
    changed();
  }

  // --- Context bar (links and tables) -------------------------------------------------------------
  function hideBar() { els.visualContext.hidden = true; els.visualContext.replaceChildren(); }
  function button(label, title, action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'context-btn'; b.textContent = label; b.title = title;
    b.addEventListener('mousedown', event => event.preventDefault()); // keep the caret in the editor
    b.addEventListener('click', action);
    return b;
  }
  function showBar(anchor, buttons) {
    const bar = els.visualContext;
    bar.replaceChildren(...buttons);
    bar.hidden = false;
    const box = anchor.getBoundingClientRect(), frame = els.card.getBoundingClientRect();
    const top = box.top - frame.top - bar.offsetHeight - 6;
    bar.style.top = (top < 0 ? box.bottom - frame.top + 6 : top) + 'px';
    bar.style.left = Math.max(0, Math.min(box.left - frame.left, frame.width - bar.offsetWidth)) + 'px';
  }
  function updateBar() {
    const range = selectionRange();
    if (!range || document.activeElement !== editor()) { hideBar(); return; }
    const link = closestIn(range.startContainer, 'a');
    if (link) { showBar(link, linkButtons(link)); return; }
    const cell = closestIn(range.startContainer, 'td, th');
    if (cell) { showBar(cell.closest('table'), tableButtons(cell)); return; }
    hideBar();
  }
  function linkButtons(link) {
    const wiki = link.classList.contains('wiki-link');
    const label = document.createElement('span');
    label.className = 'context-label'; label.textContent = wiki ? 'Page: ' + link.dataset.wikiTarget : link.getAttribute('href');
    return [label,
      button('Open', wiki ? 'Go to this page' : 'Open in a new tab', () => {
        if (wiki) LW.pages.openLink(link.dataset.wikiTarget);
        else window.open(link.getAttribute('href'), '_blank', 'noopener');
      }),
      button('Edit', 'Change where the link goes', () => {
        const current = wiki ? link.dataset.wikiTarget : link.getAttribute('href');
        const next = prompt(wiki ? 'Link to page (title):' : 'Link address:', current);
        if (!next || !next.trim() || next.trim() === current) return;
        if (!wiki && !/^(https?:\/\/|mailto:)/i.test(next.trim())) { ui.toast('Links must start with http://, https:// or mailto:'); return; }
        LW.history.record('editing a link');
        if (wiki) { link.dataset.wikiTarget = next.trim(); link.classList.toggle('missing-link', !linkExists(next.trim())); }
        else link.setAttribute('href', next.trim());
        changed();
      }),
      button('Remove', 'Keep the text, remove the link', () => {
        LW.history.record('removing a link');
        link.replaceWith(...link.childNodes);
        changed();
      })];
  }
  function tableButtons(cell) {
    const row = cell.parentElement, table = cell.closest('table');
    const index = Array.prototype.indexOf.call(row.children, cell);
    const edit = (label, action) => () => { LW.history.record(label); action(); prepare(); changed(); };
    return [
      button('+ Row', 'Add a row below', edit('adding a table row', () => {
        const fresh = emptyRow(row.children.length);
        if (row.parentElement.nodeName === 'THEAD') {
          // From the header, the new row becomes the first data row.
          let body = table.tBodies[0];
          if (!body) { body = document.createElement('tbody'); table.append(body); }
          body.prepend(fresh);
        } else row.after(fresh);
        placeCaret(fresh.cells[Math.min(index, fresh.cells.length - 1)]);
      })),
      button('+ Column', 'Add a column to the right', edit('adding a table column', () => {
        for (const r of table.rows) {
          const header = r.parentElement.nodeName === 'THEAD';
          const fresh = document.createElement(header ? 'th' : 'td');
          if (header) fresh.textContent = 'Column ' + (r.cells.length + 1); else fresh.append(document.createElement('br'));
          r.cells[index] ? r.cells[index].after(fresh) : r.append(fresh);
        }
        placeCaret(row.cells[index + 1]);
      })),
      button('− Row', 'Remove this row', edit('removing a table row', () => {
        if (row.parentElement.nodeName === 'THEAD') { ui.toast('The header row cannot be removed; delete the table instead.'); return; }
        const next = row.nextElementSibling || row.previousElementSibling || table.rows[0];
        row.remove();
        placeCaret(next.cells[Math.min(index, next.cells.length - 1)]);
      })),
      button('− Column', 'Remove this column', edit('removing a table column', () => {
        if (row.cells.length <= 1) { removeTable(table); return; }
        for (const r of [...table.rows]) r.cells[index]?.remove();
        placeCaret(row.cells[Math.max(0, index - 1)]);
      })),
      button('Delete table', 'Remove the whole table', edit('deleting a table', () => removeTable(table)))
    ];
  }
  function removeTable(table) {
    const block = table.closest('.table-block') || table;
    const p = document.createElement('p'); p.append(document.createElement('br'));
    block.replaceWith(p); placeCaret(p);
  }

  // --- Typing behavior ----------------------------------------------------------------------------
  function onKeydown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const range = selectionRange(); if (!range) return;
    const pre = closestIn(range.startContainer, 'pre');
    if (!pre) return;
    // In a code block Enter adds a line; Enter on an empty line at the end leaves the block.
    event.preventDefault();
    const before = document.createRange(); before.selectNodeContents(pre); before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange(); after.selectNodeContents(pre); after.setStart(range.endContainer, range.endOffset);
    const textBefore = linesOf(before.cloneContents()), textAfter = linesOf(after.cloneContents());
    if (range.collapsed && (textBefore === '' || textBefore.endsWith('\n')) && !textAfter.trim()) {
      LW.history.record('leaving a code block');
      const code = linesOf(pre).replace(/\n+$/, '');
      const p = document.createElement('p'); p.append(document.createElement('br'));
      if (code) { pre.textContent = code; pre.after(p); }
      else pre.replaceWith(p); // an empty code block simply turns back into a paragraph
      placeCaret(p);
      changed();
      return;
    }
    exec('insertLineBreak');
  }
  // Text with line breaks (<br> elements count as new lines, as the browser stores them in code).
  function linesOf(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeName === 'BR') return '\n';
    return Array.from(node.childNodes, linesOf).join('');
  }
  function onPaste(event) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    if (text) exec('insertText', text);
  }

  function installVisualEditor() {
    const area = editor();
    area.addEventListener('focus', () => {
      exec('defaultParagraphSeparator', 'p');
      exec('styleWithCSS', false); // <b>/<i> tags rather than inline styles
    });
    area.addEventListener('input', changed);
    area.addEventListener('keydown', onKeydown);
    area.addEventListener('paste', onPaste);
    area.addEventListener('drop', event => event.preventDefault()); // dragged HTML would bring foreign markup
    area.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== area) hideBar(); }, 150));
    area.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    document.addEventListener('selectionchange', updateBar);
  }

  Object.assign(ui, {renderVisual, visualFormat, visualInsertText, visualInsertIcon, saveVisualSelection, installVisualEditor});
})();
