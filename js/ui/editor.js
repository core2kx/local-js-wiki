/* LocalWiki — ui/editor.js
   The editor toolbar. Actions go to the editor in use (ui.activeSurface): the Visual editor
   (ui/visual-editor.js), or the Markdown editor, where they insert Markdown around the selection.
   Also inserts text at the Markdown caret (used by the symbol/icon picker and the table builder).
   Stored page content is always plain Markdown.

   Depends on: state.js, history.js, ui/elements.js, ui/page.js, ui/sidebar.js
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
      case 'link': before = '['; after = '](https://example.com)'; placeholder = 'Link text'; break;
      case 'wiki': before = '[['; after = ']]'; placeholder = 'Page title'; break;
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
