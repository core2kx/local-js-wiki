/* LocalWiki — ui/page.js
   Draws the open page: title and icon, breadcrumbs, parent and tags fields, editor text,
   rendered preview, and page info. Also owns the view preferences (Preview/Edit/Split mode,
   page width, light/dark theme), which are remembered in browser storage.

   Depends on: text.js, model.js, markdown.js, state.js, pages.js, ui/elements.js
   Provides:   LocalWiki.ui.renderAll, renderPage, renderAfterRename, renderPageStats, renderBreadcrumbs,
               renderParentChoices, renderMarkdown, renderPageIcon, fillPageIcon, focusTitle,
               moveCaretToChange, setMode, getMode, ensureEditable, applyPageWidth, loadPreferences,
               savePreferences, toggleTheme */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {wordCount} = LW.text;
  const {pathFor, findLinkTarget, descendantsOf, ancestors, sortByTitle} = LW.model;
  const {pageById, currentPage} = LW.store;
  const UI_KEY = 'localwiki:ui';
  let mode = 'split';        // 'preview' | 'edit' | 'split'
  let pageWidth = '90';      // percent of the space beside the sidebar

  function shortDate(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(date);
  }

  // --- Whole page ---------------------------------------------------------------------------------
  function renderAll() {
    els.name.textContent = state.wiki.name;
    document.title = state.wiki.name + ' — LocalWiki';
    ui.setSaveStatus();
    ui.renderTree();
    renderPage();
  }
  function renderPage() {
    const p = currentPage();
    const empty = !p;
    els.empty.hidden = !empty;
    els.mainPage.hidden = empty;
    if (empty) return;
    els.title.value = p.title;
    fillPageIcon(els.pageIconDisplay, p);
    els.content.value = p.content;
    els.tags.value = p.tags.join(', ');
    renderParentChoices(p);
    renderBreadcrumbs(p);
    renderPageStats();
    renderMarkdown();
  }
  // Like renderPage, but leaves the editor's caret alone unless the content itself changed.
  function renderAfterRename() {
    ui.renderTree();
    const p = currentPage(); if (!p) return;
    els.title.value = p.title;
    if (els.content.value !== p.content) els.content.value = p.content;
    renderParentChoices(p); renderBreadcrumbs(p); renderPageStats(); renderMarkdown();
  }

  // --- Parts of the page --------------------------------------------------------------------------
  function renderPageStats() {
    const p = currentPage(); if (!p) return;
    const words = wordCount(p.content);
    els.modified.textContent = 'Edited ' + shortDate(p.updatedAt);
    els.count.textContent = words.toLocaleString() + (words === 1 ? ' word' : ' words');
    els.pageId.textContent = pathFor(p.id);
  }
  function renderBreadcrumbs(p) {
    els.breadcrumbs.replaceChildren();
    const path = [...ancestors(state.wiki.pages, p), p];
    path.forEach((ancestor, i) => {
      if (i) { const slash = document.createElement('span'); slash.textContent = '/'; els.breadcrumbs.append(slash); }
      if (i === path.length - 1) {
        const label = document.createElement('span'); label.textContent = ancestor.title || 'Untitled';
        els.breadcrumbs.append(label);
      } else {
        const button = document.createElement('button'); button.className = 'crumb-button';
        button.textContent = ancestor.title || 'Untitled';
        button.addEventListener('click', () => LW.pages.selectPage(ancestor.id));
        els.breadcrumbs.append(button);
      }
    });
  }
  // The Parent dropdown: every page except this one and its descendants.
  function renderParentChoices(p) {
    const pages = state.wiki.pages;
    els.parent.replaceChildren();
    const none = new Option('Top-level page', ''); els.parent.add(none);
    const unavailable = descendantsOf(pages, p.id);
    for (const candidate of sortByTitle(pages.filter(x => !unavailable.has(x.id)))) {
      els.parent.add(new Option('  '.repeat(Math.min(ancestors(pages, candidate).length, 6)) + candidate.title, candidate.id));
    }
    els.parent.value = pageById(p.parentId) ? p.parentId : '';
  }
  function renderMarkdown() {
    const page = currentPage();
    els.preview.innerHTML = page ? LW.markdown.toHtml(page.content, {linkExists: target => !!findLinkTarget(state.wiki.pages, target)}) : '';
  }
  // Shows a page icon: a bundled SVG ("icon:name"), or an emoji/symbol as text.
  function fillPageIcon(element, page) {
    element.replaceChildren();
    const icon = page.icon || 'icon:file';
    if (icon.startsWith('icon:') && LW.icons.has(icon.slice(5))) {
      element.innerHTML = LW.icons.svg(icon.slice(5)); // SVG from the bundled allowlist only.
    } else {
      element.textContent = icon.startsWith('icon:') ? '▤' : icon.slice(0, 12);
    }
  }
  function renderPageIcon(page) { fillPageIcon(els.pageIconDisplay, page); }
  function focusTitle() { els.title.focus(); els.title.select(); }
  // After undo/redo: put the caret where the open page's text changed (if it did).
  function moveCaretToChange(oldContent) {
    const page = currentPage();
    if (!page || oldContent === undefined || oldContent === page.content) return;
    let i = 0;
    while (i < page.content.length && page.content[i] === oldContent[i]) i++;
    els.content.setSelectionRange(i, i);
  }

  // --- View preferences ---------------------------------------------------------------------------
  function setMode(next) {
    mode = next;
    els.card.classList.remove('mode-preview', 'mode-edit', 'mode-split');
    els.card.classList.add('mode-' + next);
    for (const btn of document.querySelectorAll('[data-mode]')) {
      btn.classList.toggle('active', btn.dataset.mode === next);
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === next));
    }
    els.toolbar.style.visibility = next === 'preview' ? 'hidden' : 'visible';
    savePreferences();
  }
  function getMode() { return mode; }
  // Editing tools switch from Preview to Edit so the change is visible.
  function ensureEditable() { if (mode === 'preview') setMode('edit'); }
  function applyPageWidth(value) {
    pageWidth = ['75', '90', '100'].includes(String(value)) ? String(value) : '90';
    document.documentElement.style.setProperty('--page-width', pageWidth + '%');
    els.pageWidth.value = pageWidth;
  }
  function toggleTheme() {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    savePreferences();
  }
  function savePreferences() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({mode, theme: document.documentElement.dataset.theme, pageWidth})); }
    catch (_) { /* Storage can be disabled for file URLs. */ }
  }
  // Applies remembered theme and page width; returns the remembered mode (apply it with setMode).
  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (saved?.theme === 'dark') document.documentElement.dataset.theme = 'dark';
      if (['edit', 'preview', 'split'].includes(saved?.mode)) mode = saved.mode;
      applyPageWidth(saved?.pageWidth);
    } catch (_) {}
    applyPageWidth(pageWidth);
    return mode;
  }

  Object.assign(ui, {
    renderAll, renderPage, renderAfterRename, renderPageStats, renderBreadcrumbs, renderParentChoices,
    renderMarkdown, renderPageIcon, fillPageIcon, focusTitle, moveCaretToChange,
    setMode, getMode, ensureEditable, applyPageWidth, loadPreferences, savePreferences, toggleTheme
  });
})();
