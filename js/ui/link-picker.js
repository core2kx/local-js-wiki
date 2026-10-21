/* LocalWiki — ui/link-picker.js
   The "Insert link" dialog, used by the editor toolbar (Visual and Markdown) and by the link bar's
   Edit button. Two kinds of link:
   - Wiki page: a search field over all pages with a live-filtered list below it (every page when the
     field is empty). Up/Down moves, Enter or a click picks. If what was typed matches no page, a last
     row offers a link to that name anyway (it shows as a missing link until the page is created).
   - Web address: http, https or mailto (a bare "example.com" gets https:// added).
   An optional "Link text" defaults to the page title (or the address).

   The dialog only collects a choice; the caller inserts it (see visual-editor.js, editor.js):
     ui.openLinkDialog({kind, target, text, editing, onChoose({kind, target, label}), onCancel})

   Depends on: text.js, model.js, markdown.js, search.js, state.js, ui/elements.js, ui/page.js
   Provides:   LocalWiki.ui.openLinkDialog, installLinkPicker */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {titleKey} = LW.text;
  const {ancestors, findLinkTarget, linkTargetFor} = LW.model;
  const MAX_ROWS = 100;

  let session = null; // {kind, editing, onChoose, onCancel, done}
  let rows = [];      // what the list shows: {type: 'page', p, parts} | {type: 'new', text}
  let active = -1;    // index of the highlighted row

  // --- Opening ------------------------------------------------------------------------------------
  // kind: 'wiki' | 'web'. target/text: the current link when editing (a title or ID, or an address),
  // or just the selected text (text) when inserting. onCancel runs when the dialog is dismissed.
  function openLinkDialog({kind = 'wiki', target = '', text = '', editing = false, onChoose, onCancel = null}) {
    session = {kind, editing, onChoose, onCancel, done: false};
    els.linkTitle.textContent = editing ? 'Edit link' : 'Insert link';
    els.linkConfirm.textContent = editing ? 'Update link' : 'Insert link';
    const page = kind === 'wiki' && editing ? findLinkTarget(state.wiki.pages, target) : null;
    els.linkSearch.value = kind === 'wiki' && editing ? (page ? page.title : target) : '';
    els.linkUrl.value = kind === 'web' ? target : '';
    // When editing, text that is just the automatic one (title or address) is left empty.
    const automatic = editing && [page?.title, target].includes(text);
    els.linkText.value = automatic ? '' : text;
    setKind(kind);
    els.linkDialog.showModal();
    const field = kind === 'web' ? els.linkUrl : els.linkSearch;
    field.focus(); field.select();
  }
  function setKind(kind) {
    session.kind = kind;
    for (const tab of document.querySelectorAll('[data-link-tab]')) {
      tab.classList.toggle('active', tab.dataset.linkTab === kind);
      tab.setAttribute('aria-pressed', String(tab.dataset.linkTab === kind));
    }
    els.linkWikiPanel.hidden = kind !== 'wiki'; els.linkList.hidden = kind !== 'wiki'; els.linkWebPanel.hidden = kind !== 'web';
    els.linkText.placeholder = kind === 'wiki' ? 'Defaults to the page title' : 'Defaults to the address';
    els.linkHint.textContent = kind === 'wiki' ? '↑ ↓ to move, Enter to choose' : 'https://…, mailto:…, or just example.com';
    showError('');
    if (kind === 'wiki') renderList();
  }
  function showError(message) { els.linkError.hidden = !message; els.linkError.textContent = message; }

  // --- The page list ------------------------------------------------------------------------------
  function renderList() {
    const query = els.linkSearch.value;
    const {results} = LW.search.pickPages(state.wiki.pages, query);
    rows = results.slice(0, MAX_ROWS).map(result => ({type: 'page', ...result}));
    const typed = query.trim();
    if (typed && !state.wiki.pages.some(p => titleKey(p.title) === titleKey(typed))) rows.push({type: 'new', text: typed});
    active = rows.length ? 0 : -1;
    showError('');

    els.linkList.replaceChildren();
    rows.forEach((row, index) => els.linkList.append(rowElement(row, index)));
    if (results.length > MAX_ROWS) {
      const note = document.createElement('li'); note.className = 'link-note'; note.setAttribute('role', 'presentation');
      note.textContent = `Showing the first ${MAX_ROWS} of ${results.length} pages. Keep typing to narrow the list.`;
      els.linkList.append(note);
    }
    if (!rows.length) {
      const empty = document.createElement('li'); empty.className = 'link-note'; empty.setAttribute('role', 'presentation');
      empty.textContent = 'This wiki has no pages yet.';
      els.linkList.append(empty);
    }
    syncActive();
  }
  function rowElement(row, index) {
    const li = document.createElement('li');
    li.id = 'link-option-' + index; li.className = 'link-row' + (row.type === 'new' ? ' link-row-new' : '');
    li.setAttribute('role', 'option');
    const icon = document.createElement('span'); icon.className = 'link-row-icon';
    const main = document.createElement('span'); main.className = 'link-row-main';
    const title = document.createElement('span'); title.className = 'link-row-title'; title.dir = 'auto';
    const detail = document.createElement('span'); detail.className = 'link-row-path'; detail.dir = 'auto';
    if (row.type === 'page') {
      ui.fillPageIcon(icon, row.p);
      for (const part of row.parts) {
        if (!part.mark) { title.append(part.text); continue; }
        const mark = document.createElement('mark'); mark.textContent = part.text; title.append(mark);
      }
      const path = ancestors(state.wiki.pages, row.p).map(x => x.title).join(' / ');
      detail.textContent = [path, row.p.id === state.currentId ? 'this page' : ''].filter(Boolean).join(' · ');
    } else {
      icon.textContent = '+';
      title.textContent = `Link to “${row.text}”`;
      detail.textContent = "This page doesn't exist yet. The link shows as missing until you create it.";
    }
    main.append(title); if (detail.textContent) main.append(detail);
    li.append(icon, main);
    li.addEventListener('click', () => choose(index));
    return li;
  }
  // The highlighted row follows the arrow keys; the search field keeps the focus throughout.
  function syncActive() {
    els.linkList.querySelectorAll('.link-row').forEach((li, index) => {
      li.classList.toggle('active', index === active);
      li.setAttribute('aria-selected', String(index === active));
    });
    const current = els.linkList.querySelector('.link-row.active');
    if (current) { els.linkSearch.setAttribute('aria-activedescendant', current.id); current.scrollIntoView({block: 'nearest'}); }
    else els.linkSearch.removeAttribute('aria-activedescendant');
  }
  function move(delta) {
    if (!rows.length) return;
    active = (active + delta + rows.length) % rows.length;
    syncActive();
  }

  // --- Choosing -----------------------------------------------------------------------------------
  function finish(result) {
    const current = session;
    current.done = true;
    els.linkDialog.close();
    current.onChoose(result);
  }
  function choose(index) {
    const row = rows[index];
    if (!row) return;
    const text = els.linkText.value.trim();
    if (row.type === 'page') finish({kind: 'wiki', target: linkTargetFor(row.p), label: text || row.p.title});
    else finish({kind: 'wiki', target: row.text, label: text || row.text});
  }
  function confirm() {
    if (session.kind === 'wiki') {
      if (active < 0) showError('Choose a page, or type a name to link to a new one.');
      else choose(active);
      return;
    }
    const address = LW.markdown.webAddress(els.linkUrl.value);
    if (!address) { showError('Enter a web address starting with http://, https:// or mailto: (or a name like example.com).'); els.linkUrl.focus(); return; }
    finish({kind: 'web', target: address, label: els.linkText.value.trim() || address});
  }

  // --- Events -------------------------------------------------------------------------------------
  function installLinkPicker() {
    for (const tab of document.querySelectorAll('[data-link-tab]')) {
      tab.addEventListener('click', () => {
        setKind(tab.dataset.linkTab);
        (tab.dataset.linkTab === 'web' ? els.linkUrl : els.linkSearch).focus();
      });
    }
    els.linkSearch.addEventListener('input', renderList);
    els.linkSearch.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') { event.preventDefault(); confirm(); }
    });
    for (const field of [els.linkUrl, els.linkText]) {
      field.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); confirm(); } });
    }
    els.linkUrl.addEventListener('input', () => showError(''));
    // Clicking a row must not move the focus away from the search field.
    els.linkList.addEventListener('mousedown', event => event.preventDefault());
    els.linkConfirm.addEventListener('click', confirm);
    els.linkCancel.addEventListener('click', () => els.linkDialog.close());
    els.linkClose.addEventListener('click', () => els.linkDialog.close());
    // Any way of closing without a choice (Cancel, ×, Esc) tells the caller.
    els.linkDialog.addEventListener('close', () => {
      const closed = session;
      session = null;
      if (closed && !closed.done) closed.onCancel?.();
    });
  }

  Object.assign(ui, {openLinkDialog, installLinkPicker});
})();
