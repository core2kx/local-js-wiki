/* LocalWiki — ui/sidebar.js
   The sidebar's page list: the nested page tree, or search results while the search box has text.

   Depends on: i18n.js, model.js, search.js, state.js, pages.js, ui/elements.js, ui/page.js (page icons)
   Provides:   LocalWiki.ui.renderTree, renderTreeIfSearching, clearSearch */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {ancestors, sortByTitle} = LW.model;
  const {pageById} = LW.store;
  const {t} = LW.i18n;
  const {searchPages, snippetParts} = LW.search;

  function renderTree() {
    const raw = els.search.value.trim();
    els.sidebarHeading.textContent = t(raw ? 'side.results' : 'side.pages');
    els.nav.replaceChildren();
    if (raw) renderSearchResults(raw);
    else renderPageTree();
  }
  // Only the search results depend on page text, so typing redraws the list only while searching.
  function renderTreeIfSearching() { if (els.search.value) renderTree(); }
  function clearSearch() { els.search.value = ''; }

  function renderSearchResults(raw) {
    const {terms, phrase, matches} = searchPages(state.wiki.pages, raw);
    for (const {p, body} of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-entry nav-result' + (p.id === state.currentId ? ' active' : '');
      const title = document.createElement('span');
      title.className = 'nav-result-title'; title.dir = 'auto'; title.textContent = p.title || t('page.untitled');
      const path = document.createElement('span');
      path.className = 'nav-result-path'; path.textContent = ancestors(state.wiki.pages, p).map(x => x.title).join(' / ') || t('side.top_level');
      const snippet = document.createElement('span'); snippet.className = 'nav-result-snippet';
      snippet.dir = 'auto';
      for (const part of snippetParts(p, body, terms, phrase)) {
        if (!part.mark) { snippet.append(part.text); continue; }
        const mark = document.createElement('mark'); mark.textContent = part.text;
        snippet.append(mark);
      }
      button.append(title, path, snippet);
      button.addEventListener('click', () => LW.pages.selectPage(p.id));
      els.nav.append(button);
    }
    if (!matches.length) {
      const noResults = document.createElement('div');
      noResults.className = 'search-empty'; noResults.textContent = t('side.no_results');
      els.nav.append(noResults);
    }
  }

  function renderPageTree() {
    const pages = state.wiki.pages;
    if (!pages.length) {
      const blank = document.createElement('div'); blank.className = 'search-empty';
      blank.textContent = t('side.no_pages');
      els.nav.append(blank);
      return;
    }
    // A page whose parent did not load is shown at the top level.
    const isRoot = p => !p.parentId || !pageById(p.parentId);
    const visit = (parentId, container) => {
      for (const page of sortByTitle(pages.filter(p => parentId === null ? isRoot(p) : p.parentId === parentId))) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.title = page.title;
        btn.className = 'nav-entry' + (page.id === state.currentId ? ' active' : '');
        const icon = document.createElement('span'); icon.className = 'nav-page-icon'; ui.fillPageIcon(icon, page);
        const name = document.createElement('span'); name.className = 'nav-title'; name.dir = 'auto'; name.textContent = page.title || t('page.untitled');
        btn.append(icon, name);
        btn.addEventListener('click', () => LW.pages.selectPage(page.id));
        container.append(btn);
        if (pages.some(p => p.parentId === page.id)) {
          const group = document.createElement('div'); group.className = 'nav-group';
          container.append(group); visit(page.id, group);
        }
      }
    };
    visit(null, els.nav);
  }

  Object.assign(ui, {renderTree, renderTreeIfSearching, clearSearch});
})();
