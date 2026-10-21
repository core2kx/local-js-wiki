/* LocalWiki — pages.js
   Everything a user can do to pages: select, create, delete, edit title/tags/content/parent/icon,
   follow links, and rename the wiki. Each operation records an undo step, changes the state,
   marks it dirty (which triggers autosave), and asks the UI to redraw what changed.

   Renaming: typing in the title field changes the title live, but the rename is only "committed"
   when the field is left or Enter is pressed (commitTitle). Committing checks that the title is
   unique, rewrites [[links]] to the page in every page, and moves the page to a new ID/filename
   (updating children's parentId). Intermediate titles never capture links, and autosave waits
   while state.renameFrom is set. Anything that switches context calls commitTitle() first.

   Depends on: text.js, model.js, markdown.js, state.js, revisions.js, history.js; asks LocalWiki.ui to redraw.
   Provides:   LocalWiki.pages */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {titleKey} = LW.text;
  const {isoNow, uniqueId, pageWithTitle, findLinkTarget, descendantsOf} = LW.model;
  const {rewriteLinks} = LW.markdown;
  const state = LW.state;
  const {pageById, currentPage, markDirty, touchPage} = LW.store;
  const history = LW.history;
  const ui = (LW.ui ||= {});

  function selectPage(id) {
    commitTitle();
    if (!pageById(id)) return;
    state.currentId = id;
    ui.renderTree(); ui.renderPage(); LW.store.saveDraft();
  }

  function createPage(parentId = null, desiredTitle = 'New page') {
    commitTitle();
    const wiki = state.wiki;
    if (parentId && !pageById(parentId)) parentId = null;
    desiredTitle = desiredTitle.normalize('NFC');
    const existing = new Set(wiki.pages.map(p => titleKey(p.title)));
    let title = desiredTitle;
    for (let i = 2; existing.has(titleKey(title)); i++) title = desiredTitle + ' (' + i + ')';
    history.record(`creating "${title}"`);
    const page = {id: uniqueId(title, [...wiki.pages, ...state.setAside]), title, parentId, tags: [], content: '', icon: '', createdAt: isoNow(), updatedAt: isoNow()};
    wiki.pages.push(page);
    state.indexDirty = true;
    state.changedIds.add(page.id);
    state.currentId = page.id;
    ui.clearSearch();
    markDirty(); ui.renderAll();
    ui.setMode('edit');
    ui.focusTitle();
    return page;
  }

  // Deletes the current page and everything nested under it, after confirmation.
  function deletePage() {
    commitTitle();
    const p = currentPage(); if (!p) return;
    const wiki = state.wiki;
    const ids = descendantsOf(wiki.pages, p.id);
    const message = ids.size === 1 ? `Delete "${p.title}"? You can restore it with Undo.` :
      `Delete "${p.title}" and its ${ids.size - 1} child page(s)? You can restore them with Undo.`;
    if (!confirm(message)) return;
    history.record(`deleting "${p.title}"` + (ids.size > 1 ? ` and ${ids.size - 1} child page(s)` : ''));
    for (const id of ids) state.changedIds.delete(id);
    wiki.pages = wiki.pages.filter(x => !ids.has(x.id));
    state.indexDirty = true;
    state.currentId = p.parentId && pageById(p.parentId) ? p.parentId : (wiki.pages[0]?.id || null);
    markDirty(); ui.renderAll(); ui.toast('Page deleted. Use Undo to restore it.');
  }

  // --- Title and renaming -------------------------------------------------------------------------
  // Called for each keystroke in the title field.
  function editTitle(value) {
    const p = currentPage(); if (!p) return;
    // The whole title edit, including the rename it commits, is one undo step.
    if (!state.renameFrom) { history.record(`renaming "${p.title}"`); state.renameFrom = {id: p.id, title: p.title}; }
    p.title = value; touchPage(p);
    ui.renderTree(); ui.renderBreadcrumbs(p);
  }
  function commitTitle() {
    if (!state.renameFrom) return;
    const {id: oldId, title: oldTitle} = state.renameFrom;
    state.renameFrom = null;
    const page = pageById(oldId);
    if (!page) return;
    const wiki = state.wiki;
    const title = page.title.trim().normalize('NFC');
    const reject = message => {
      page.title = oldTitle; touchPage(page); history.dropNoop(page); ui.renderAfterRename(); ui.toast(message);
    };
    if (!title) { reject('A page title cannot be empty.'); return; }
    const clash = pageWithTitle(wiki.pages, title, oldId);
    if (clash) { reject(`Another page is already titled "${clash.title}".`); return; }
    page.title = title;
    if (title === oldTitle) { touchPage(page); history.dropNoop(page); ui.renderAfterRename(); return; }
    const newId = uniqueId(title, [...wiki.pages, ...state.setAside], oldId);
    // Links resolve by ID first, then by case-insensitive title (see model.findLinkTarget). A target
    // that is both this page's ID and its title (e.g. [[welcome]]) is rewritten as a title link.
    const isTarget = target => {
      const owner = pageById(target);
      if (owner && owner.id !== oldId) return null;
      if (titleKey(target) === titleKey(oldTitle)) return 'title';
      return target === oldId ? 'id' : null;
    };
    let relinked = 0;
    for (const other of wiki.pages) {
      const updated = rewriteLinks(other.content, isTarget, kind => kind === 'id' ? newId : title);
      if (updated !== other.content) { other.content = updated; touchPage(other); relinked++; }
    }
    if (newId !== oldId) {
      for (const child of wiki.pages) if (child.parentId === oldId) { child.parentId = newId; touchPage(child); }
      state.changedIds.delete(oldId);
      page.id = newId;
      if (state.currentId === oldId) state.currentId = newId;
      state.indexDirty = true;
      // Saved revisions follow the page to its new filename (and back, if this is undone).
      history.attachRename(oldId, newId);
      LW.revisions.noteRename(oldId, newId);
    }
    touchPage(page);
    ui.renderAfterRename();
    if (relinked) ui.toast(`Renamed. Updated links in ${relinked} page(s).`);
  }

  // --- Other page fields --------------------------------------------------------------------------
  function editTags(text) {
    const p = currentPage(); if (!p) return;
    history.record('tag edits', 'tags:' + p.id);
    p.tags = [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))];
    touchPage(p); ui.renderTreeIfSearching();
  }
  function editContent(text) {
    const p = currentPage(); if (!p) return;
    history.record('typing', 'content:' + p.id);
    p.content = text; touchPage(p);
    ui.renderPageStats(); ui.renderMarkdown(); ui.renderTreeIfSearching();
  }
  // parentId: the new parent's id, or null for top level.
  function movePage(parentId) {
    const p = currentPage(); if (!p) return;
    if (parentId && descendantsOf(state.wiki.pages, p.id).has(parentId)) { ui.toast('Cannot move a page inside itself.'); ui.renderParentChoices(p); return; }
    history.record(`moving "${p.title}"`);
    p.parentId = parentId; touchPage(p);
    ui.renderTree(); ui.renderBreadcrumbs(p); ui.renderParentChoices(p);
  }
  // icon: "icon:<name>", an emoji or symbol, or "" to remove it.
  function setIcon(icon) {
    const page = currentPage(); if (!page) return;
    history.record(icon ? 'changing the page icon' : 'removing the page icon');
    page.icon = icon; touchPage(page);
    ui.renderPageIcon(page); ui.renderTree();
  }

  // Clicking a [[link]]: go to the page, or offer to create it.
  function openLink(target) {
    const match = findLinkTarget(state.wiki.pages, target);
    if (match) selectPage(match.id);
    else if (confirm(`Page "${target}" does not exist. Create it?`)) createPage(null, target.slice(0, 140));
  }

  // --- Saved revisions (see revisions.js) ---------------------------------------------------------
  // Brings back an earlier version's text, tags and icon. Title and position stay as they are.
  function restoreRevision(revision) {
    const page = currentPage(); if (!page) return;
    history.record(`restoring an earlier version of "${page.title}"`);
    page.content = revision.content;
    page.tags = [...(revision.tags || [])];
    page.icon = revision.icon || '';
    touchPage(page);
    ui.renderPage(); ui.renderTree();
    ui.toast('Restored the earlier version. Use Undo to go back.');
  }
  // Brings back a deleted page from its newest revision (file: from revisions.deletedPages()).
  function restoreDeleted(file) {
    commitTitle();
    const wiki = state.wiki;
    const revision = file.revisions[file.revisions.length - 1];
    const existing = new Set(wiki.pages.map(p => titleKey(p.title)));
    let title = revision.title;
    for (let i = 2; existing.has(titleKey(title)); i++) title = revision.title + ' (' + i + ')';
    history.record(`restoring "${title}"`);
    const owners = [...wiki.pages, ...state.setAside];
    const id = owners.some(p => p.id.toUpperCase() === file.id.toUpperCase()) ? uniqueId(title, owners) : file.id;
    const parentId = revision.parentId && pageById(revision.parentId) ? revision.parentId : null;
    const page = {id, title, parentId, tags: [...(revision.tags || [])], content: revision.content, icon: revision.icon || '', createdAt: isoNow(), updatedAt: isoNow()};
    wiki.pages.push(page);
    if (id !== file.id) LW.revisions.noteRename(file.id, id); // its revisions move with it
    state.indexDirty = true;
    state.changedIds.add(id);
    state.currentId = id;
    ui.clearSearch();
    markDirty(); ui.renderAll();
    ui.toast(`Restored "${title}".`);
  }

  function renameWiki() {
    const wiki = state.wiki;
    const name = prompt('Wiki name:', wiki.name);
    if (name === null || !name.trim() || wiki.name === name.trim()) return;
    history.record('renaming the wiki');
    wiki.name = name.trim().slice(0, 140);
    state.indexDirty = true; markDirty(); ui.renderAll();
  }

  LW.pages = {selectPage, createPage, deletePage, editTitle, commitTitle, editTags, editContent, movePage, setIcon, openLink, restoreRevision, restoreDeleted, renameWiki};
})();
