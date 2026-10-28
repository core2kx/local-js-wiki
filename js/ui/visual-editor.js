/* LocalWiki — ui/visual-editor.js
   The Visual view: the page shown formatted and edited in place (an HTML "contenteditable" area).
   The page is still stored as Markdown: the area is filled from markdown.toHtml, and after every
   change it is converted back with htmlToMarkdown and saved through pages.editContent (so undo,
   autosave, renames and history work exactly as with the Markdown editor).

   Toolbar buttons format the selection; the link buttons open the link dialog (ui/link-picker.js).
   A small context bar appears for links (Open, Edit, Remove), for a clicked picture (size, description, remove) and inside tables (add/remove rows and columns, delete the table). Paste inserts plain
   text, so formatting from other sites cannot sneak in.

   Depends on: i18n.js, model.js, palettes.js, markdown.js, html-to-markdown.js, state.js, history.js, pages.js,
               ui/elements.js, ui/link-picker.js
   Provides:   LocalWiki.ui.renderVisual, visualFormat, visualInsertText, visualInsertIcon, visualInsertImage, visualStyle,
               saveVisualSelection, installVisualEditor */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {currentPage} = LW.store;
  const {findLinkTarget} = LW.model;
  const {t} = LW.i18n;
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
    editor().innerHTML = LW.markdown.toHtml(page.content, {linkExists, imageUrl: LW.images.urlFor});
    prepare();
    shown = {id: page.id, content: page.content};
    hideBar();
  }
  // Icons are single, uneditable characters; a trailing empty paragraph lets the caret get below
  // a final table or code block.
  function prepare() {
    for (const icon of editor().querySelectorAll('.inline-wiki-icon')) icon.contentEditable = 'false';
    for (const missing of editor().querySelectorAll('.page-image-missing')) missing.title = t('img.missing_tip', {path: missing.dataset.image});
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
    if (kind === 'link' || kind === 'wiki') { insertLink(kind === 'wiki' ? 'wiki' : 'web'); return; } // records its own step
    editor().focus();
    if (!selectionRange()) placeCaret(editor(), true);
    LW.history.record('act.format');
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
    code.textContent = range.collapsed ? t('insert.code') : range.toString();
    range.deleteContents(); range.insertNode(code);
    if (range.collapsed) placeCaret(code); else { const after = document.createRange(); after.setStartAfter(code); after.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(after); }
  }
  // The <a> for a chosen link: a wiki link (data-wiki-target) or an external one.
  function anchorFor(kind, target, label) {
    const a = document.createElement('a');
    if (kind === 'wiki') {
      a.href = '#'; a.className = 'wiki-link' + (linkExists(target) ? '' : ' missing-link');
      a.dataset.wikiTarget = target;
    } else {
      a.href = target; a.target = '_blank'; a.rel = 'noopener noreferrer';
    }
    a.textContent = label;
    return a;
  }
  // A collapsed range at the end of the page (inside the last paragraph, if the page ends with one).
  function endRange() {
    const range = document.createRange();
    const last = editor().lastElementChild;
    range.selectNodeContents(last && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(last.nodeName) ? last : editor());
    range.collapse(false);
    return range;
  }
  // Toolbar link buttons: choose the target in the link dialog, then insert at the saved selection
  // (the selected text becomes the link text).
  function insertLink(kind) {
    editor().focus();
    saveVisualSelection();
    const selected = savedRange ? savedRange.toString().trim() : '';
    ui.openLinkDialog({
      kind, text: selected,
      onChoose: ({kind: chosen, target, label}) => {
        restoreSelection();
        LW.history.record('act.insert_link');
        const range = selectionRange() || endRange();
        const a = anchorFor(chosen, target, label);
        range.deleteContents(); range.insertNode(a);
        const after = document.createRange(); after.setStartAfter(a); after.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(after);
        changed();
      },
      onCancel: restoreSelection
    });
  }
  // The link bar's Edit button: the same dialog, for an existing link.
  function editLink(link) {
    const wiki = link.classList.contains('wiki-link');
    ui.openLinkDialog({
      kind: wiki ? 'wiki' : 'web', editing: true, text: link.textContent,
      target: wiki ? link.dataset.wikiTarget : link.getAttribute('href'),
      onChoose: ({kind, target, label}) => {
        if (!link.isConnected) return;
        LW.history.record('act.edit_link');
        const a = anchorFor(kind, target, label);
        link.replaceWith(a);
        editor().focus(); placeCaret(a, true);
        changed();
      }
    });
  }
  function emptyRow(cells, header = false) {
    const tr = document.createElement('tr');
    for (let i = 0; i < cells; i++) {
      const cell = document.createElement(header ? 'th' : 'td');
      if (header) cell.textContent = t('table.column_n', {n: i + 1}); else cell.append(document.createElement('br'));
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

  // --- Text sizes and colors ----------------------------------------------------------------------
  // The selected words get <span class="text-red"> (or text-large ...); a span of the same kind
  // already there is replaced. value null: back to normal size / default color.
  const STYLE_VALUES = {size: ['small', 'large', 'huge'], color: LW.palettes.TEXT_COLOR_NAMES};
  const STYLE_BOUNDARY = /^(P|DIV|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE|UL|OL|TABLE|THEAD|TBODY|TR)$/;
  const indexOf = node => Array.prototype.indexOf.call(node.parentNode.childNodes, node);
  const isStyleSpan = (node, group) => node.nodeName === 'SPAN' && STYLE_VALUES[group].some(value => node.classList.contains('text-' + value));
  // Cuts every inline element (bold, links, other spans) in two at a point, up to the enclosing
  // block, so that nothing straddles it. Returns the point as {parent, before}: the block and the
  // child that comes right after the point (null: the end of the block).
  function splitAt(container, offset) {
    let parent = container, index = offset;
    if (container.nodeType === 3) {
      parent = container.parentNode;
      if (offset <= 0) index = indexOf(container);
      else if (offset >= container.nodeValue.length) index = indexOf(container) + 1;
      else { container.splitText(offset); index = indexOf(container) + 1; }
    }
    while (parent !== editor() && !STYLE_BOUNDARY.test(parent.nodeName)) {
      if (index <= 0) index = indexOf(parent);
      else if (index >= parent.childNodes.length) index = indexOf(parent) + 1;
      else {
        const tail = parent.cloneNode(false);
        while (parent.childNodes[index]) tail.append(parent.childNodes[index]);
        parent.after(tail); index = indexOf(parent) + 1;
      }
      parent = parent.parentNode;
    }
    return {parent, before: parent.childNodes[index] || null};
  }
  const pointIndex = point => (point.before ? indexOf(point.before) : point.parent.childNodes.length);
  function visualStyle(group, value) {
    editor().focus(); restoreSelection();
    const selected = selectionRange();
    if (!selected || selected.collapsed || !editor().contains(selected.commonAncestorContainer)) { ui.toast(t('toast.select_text')); return; }
    LW.history.record(group === 'size' ? 'act.text_size' : 'act.text_color');
    // End first, so the start is still valid; afterwards nothing straddles either boundary.
    const end = splitAt(selected.endContainer, selected.endOffset);
    const start = splitAt(selected.startContainer, selected.startOffset);
    const range = document.createRange();
    range.setStart(start.parent, pointIndex(start)); range.setEnd(end.parent, pointIndex(end));
    // The words to style, found before anything moves: text inside paragraphs, headings, list items,
    // quotes and table cells (never inside code).
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim() || !range.intersectsNode(node) || closestIn(node, 'pre, code, .inline-wiki-icon')) continue;
      if (closestIn(node, 'p, h1, h2, h3, h4, li, td, th, blockquote')) texts.push(node);
    }
    if (!texts.length) return;
    for (const span of [...editor().querySelectorAll('span')]) {
      if (isStyleSpan(span, group) && range.intersectsNode(span)) span.replaceWith(...span.childNodes);
    }
    if (value) {
      for (const node of texts) {
        const span = document.createElement('span'); span.className = 'text-' + value;
        node.replaceWith(span); span.append(node);
      }
    }
    mergeNeighbours();
    const outer = node => (isStyleSpan(node.parentNode, group) && node.parentNode.childNodes.length === 1 ? node.parentNode : node);
    const after = document.createRange();
    after.setStartBefore(outer(texts[0])); after.setEndAfter(outer(texts[texts.length - 1]));
    getSelection().removeAllRanges(); getSelection().addRange(after);
    changed();
  }
  // Joins neighbouring elements of the same kind that splitting left behind: **a** **b** and
  // two spans with the same size or color each become one.
  function mergeNeighbours() {
    const same = (a, b) => b && b.nodeType === 1 && a.nodeName === b.nodeName && a.className === b.className && a.nodeName !== 'A';
    for (let again = true; again;) {
      again = false;
      for (const el of editor().querySelectorAll('strong, b, em, i, del, s, span')) {
        if (el.nodeName === 'SPAN' && !el.className.startsWith('text-')) continue;
        while (el.nextSibling && same(el, el.nextSibling)) { const next = el.nextSibling; el.append(...next.childNodes); next.remove(); again = true; }
      }
    }
  }

  // --- Pictures -----------------------------------------------------------------------------------
  function visualInsertImage(path, alt) {
    restoreSelection();
    LW.history.record('act.insert_image');
    const picture = document.createElement('img');
    picture.className = 'page-image'; picture.src = LW.images.urlFor(path); picture.alt = alt;
    picture.dataset.image = path; picture.dataset.alt = alt;
    const range = selectionRange() || endRange();
    range.deleteContents(); range.insertNode(picture);
    const after = document.createRange(); after.setStartAfter(picture); after.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(after);
    prepare();
    changed();
  }
  // The picture the selection is exactly around (after clicking it), if any.
  function selectedPicture(range) {
    if (!range || range.startContainer !== range.endContainer || range.startContainer.nodeType !== 1 || range.endOffset - range.startOffset !== 1) return null;
    const node = range.startContainer.childNodes[range.startOffset];
    return node && node.nodeName === 'IMG' && node.dataset.image ? node : null;
  }
  const SIZE_TEXT = {25: 'img.size_25', 50: 'img.size_50', 75: 'img.size_75', 100: 'img.size_100'};
  function pictureButtons(picture) {
    const label = document.createElement('span');
    label.className = 'context-label'; label.textContent = t('img.label', {path: picture.dataset.image});
    const edit = (action, change) => () => { LW.history.record(action); change(); changed(); updateBar(); };
    const current = picture.dataset.width || '100';
    const sizes = LW.model.IMAGE_WIDTHS.map(percent => {
      const b = button(t(SIZE_TEXT[percent]), t('img.size_tip', {percent}), edit('act.image_size', () => {
        if (percent === 100) delete picture.dataset.width; else picture.dataset.width = String(percent);
      }));
      b.classList.toggle('is-active', current === String(percent));
      return b;
    });
    return [label, ...sizes,
      button(t('img.describe'), t('img.describe_tip'), () => {
        const alt = prompt(t('img.describe_prompt'), picture.dataset.alt || '');
        if (alt === null) return;
        edit('act.image_describe', () => { picture.dataset.alt = alt.replace(/[\[\]\n]/g, ' ').trim(); picture.alt = picture.dataset.alt; })();
      }),
      button(t('img.remove'), t('img.remove_tip'), edit('act.remove_image', () => picture.remove()))];
  }

  // --- Inserting from the picker ------------------------------------------------------------------
  function visualInsertText(text) {
    restoreSelection();
    LW.history.record('act.insert_text');
    exec('insertText', text);
    changed();
  }
  function visualInsertIcon(name) {
    if (!LW.icons.has(name)) return;
    restoreSelection();
    LW.history.record('act.insert_icon');
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
    for (const other of editor().querySelectorAll('img.is-selected')) other.classList.remove('is-selected');
    const picture = selectedPicture(range);
    if (picture) { picture.classList.add('is-selected'); showBar(picture, pictureButtons(picture)); return; }
    const link = closestIn(range.startContainer, 'a');
    if (link) { showBar(link, linkButtons(link)); return; }
    const cell = closestIn(range.startContainer, 'td, th');
    if (cell) { showBar(cell.closest('table'), tableButtons(cell)); return; }
    hideBar();
  }
  function linkButtons(link) {
    const wiki = link.classList.contains('wiki-link');
    const label = document.createElement('span');
    label.className = 'context-label'; label.textContent = wiki ? t('ctx.page', {target: link.dataset.wikiTarget}) : link.getAttribute('href');
    return [label,
      button(t('ctx.open'), t(wiki ? 'ctx.open_page_tip' : 'ctx.open_web_tip'), () => {
        if (wiki) LW.pages.openLink(link.dataset.wikiTarget);
        else window.open(link.getAttribute('href'), '_blank', 'noopener');
      }),
      button(t('ctx.edit'), t('ctx.edit_tip'), () => editLink(link)),
      button(t('ctx.remove'), t('ctx.remove_tip'), () => {
        LW.history.record('act.remove_link');
        link.replaceWith(...link.childNodes);
        changed();
      })];
  }
  function tableButtons(cell) {
    const row = cell.parentElement, table = cell.closest('table');
    const index = Array.prototype.indexOf.call(row.children, cell);
    const edit = (label, action) => () => { LW.history.record(label); action(); prepare(); changed(); };
    return [
      button(t('table.add_row'), t('table.add_row_tip'), edit('act.add_row', () => {
        const fresh = emptyRow(row.children.length);
        if (row.parentElement.nodeName === 'THEAD') {
          // From the header, the new row becomes the first data row.
          let body = table.tBodies[0];
          if (!body) { body = document.createElement('tbody'); table.append(body); }
          body.prepend(fresh);
        } else row.after(fresh);
        placeCaret(fresh.cells[Math.min(index, fresh.cells.length - 1)]);
      })),
      button(t('table.add_col'), t('table.add_col_tip'), edit('act.add_col', () => {
        for (const r of table.rows) {
          const header = r.parentElement.nodeName === 'THEAD';
          const fresh = document.createElement(header ? 'th' : 'td');
          if (header) fresh.textContent = t('table.column_n', {n: r.cells.length + 1}); else fresh.append(document.createElement('br'));
          r.cells[index] ? r.cells[index].after(fresh) : r.append(fresh);
        }
        placeCaret(row.cells[index + 1]);
      })),
      button(t('table.remove_row'), t('table.remove_row_tip'), edit('act.remove_row', () => {
        if (row.parentElement.nodeName === 'THEAD') { ui.toast(t('table.header_row_error')); return; }
        const next = row.nextElementSibling || row.previousElementSibling || table.rows[0];
        row.remove();
        placeCaret(next.cells[Math.min(index, next.cells.length - 1)]);
      })),
      button(t('table.remove_col'), t('table.remove_col_tip'), edit('act.remove_col', () => {
        if (row.cells.length <= 1) { removeTable(table); return; }
        for (const r of [...table.rows]) r.cells[index]?.remove();
        placeCaret(row.cells[Math.max(0, index - 1)]);
      })),
      button(t('table.delete'), t('table.delete_tip'), edit('act.delete_table', () => removeTable(table)))
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
      LW.history.record('act.leave_code');
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
  const pictureFiles = list => [...(list || [])].filter(file => file.type.startsWith('image/'));
  function onPaste(event) {
    event.preventDefault();
    const pictures = pictureFiles(event.clipboardData?.files);
    if (pictures.length) { saveVisualSelection(); ui.addImageFiles(pictures); return; }
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
    area.addEventListener('dragover', event => { if (pictureFiles(event.dataTransfer?.files).length || [...(event.dataTransfer?.items || [])].some(item => item.type.startsWith('image/'))) event.preventDefault(); });
    area.addEventListener('drop', event => { // dragged HTML would bring foreign markup; only picture files are taken
      event.preventDefault();
      const pictures = pictureFiles(event.dataTransfer?.files);
      if (!pictures.length) return;
      const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (at && editor().contains(at.startContainer)) { getSelection().removeAllRanges(); getSelection().addRange(at); }
      saveVisualSelection(); ui.addImageFiles(pictures);
    });
    area.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== area) hideBar(); }, 150));
    area.addEventListener('click', event => {
      if (event.target.closest('a')) event.preventDefault();
      if (event.target.matches?.('img.page-image')) { const range = document.createRange(); range.selectNode(event.target); getSelection().removeAllRanges(); getSelection().addRange(range); }
    });
    document.addEventListener('selectionchange', updateBar);
  }

  Object.assign(ui, {renderVisual, visualFormat, visualInsertText, visualInsertIcon, visualInsertImage, visualStyle, saveVisualSelection, installVisualEditor});
})();
