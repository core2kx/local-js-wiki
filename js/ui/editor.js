/* LocalWiki — ui/editor.js
   The editor toolbar. Actions go to the editor in use (ui.activeSurface): the Visual editor
   (ui/visual-editor.js), or the Markdown editor, where they insert Markdown around the selection.
   Also inserts text at the Markdown caret (used by the symbol/icon picker and the table builder).
   Stored page content is always plain Markdown.

   Depends on: markdown.js, state.js, history.js, ui/elements.js, ui/page.js, ui/sidebar.js, ui/link-picker.js
   Provides:   LocalWiki.ui.formatSelection, insertAtCaret */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {currentPage, touchPage} = LW.store;

  // kind: a toolbar button's data-format value.
  function formatSelection(kind) {
    const p = currentPage(); if (!p) return;
    if (ui.activeSurface() === 'visual') { ui.visualFormat(kind); return; }
    if (kind === 'table') { ui.openTableBuilder(); return; }
    ui.ensureEditable();
    if (kind === 'link' || kind === 'wiki') { insertLink(kind === 'wiki' ? 'wiki' : 'web'); return; }
    const input = els.content;
    const start = input.selectionStart, end = input.selectionEnd;
    const selected = input.value.substring(start, end);
    let before = '', after = '', placeholder = 'text';
    switch (kind) {
      case 'heading': before = '## '; placeholder = 'Heading'; break;
      case 'bold': before = '**'; after = '**'; break;
      case 'italic': before = '*'; after = '*'; break;
      case 'strike': before = '~~'; after = '~~'; break;
      case 'list': before = '- '; placeholder = 'List item'; break;
      case 'olist': before = '1. '; placeholder = 'List item'; break;
      case 'quote': before = '> '; placeholder = 'Quote'; break;
      case 'codeblock': before = '```\n'; after = '\n```'; placeholder = 'code'; break;
      case 'code': before = '`'; after = '`'; break;
      default: return;
    }
    const insertion = before + (selected || placeholder) + after;
    LW.history.record('formatting');
    input.setRangeText(insertion, start, end, 'end');
    p.content = input.value;
    touchPage(p); ui.renderMarkdown(); ui.renderTree(); ui.renderPageStats();
    input.focus();
    // With nothing selected, select the placeholder so typing replaces it.
    if (!selected && placeholder) input.setSelectionRange(start + before.length, start + before.length + placeholder.length);
  }

  // Markdown editor links: choose the target in the link dialog, then write the link over the
  // selection (the selected text becomes the link text).
  function insertLink(kind) {
    const input = els.content;
    const start = input.selectionStart, end = input.selectionEnd;
    ui.openLinkDialog({
      kind, text: input.value.substring(start, end).trim(),
      onChoose: ({kind: chosen, target, label}) => {
        const page = currentPage(); if (!page) return;
        LW.history.record('inserting a link');
        input.focus();
        input.setRangeText(LW.markdown.linkMarkdown(chosen, target, label), start, end, 'end');
        page.content = input.value;
        touchPage(page); ui.renderMarkdown(); ui.renderTree(); ui.renderPageStats();
      },
      onCancel: () => { input.focus(); input.setSelectionRange(start, end); }
    });
  }

  function insertAtCaret(text, caret = els.content.selectionStart) {
    const page = currentPage(); if (!page) return;
    ui.ensureEditable();
    const textarea = els.content;
    caret = Math.max(0, Math.min(caret, textarea.value.length));
    LW.history.record('inserting text');
    textarea.setRangeText(text, caret, caret, 'end');
    page.content = textarea.value;
    touchPage(page); ui.renderMarkdown(); ui.renderPageStats();
    ui.renderTreeIfSearching();
    textarea.focus();
  }

  Object.assign(ui, {formatSelection, insertAtCaret});
})();
