/* LocalWiki — pages.js
   Everything a user can do to pages: select, create, delete, edit title/tags/content/parent/icon,
   follow links, and rename the wiki. Each operation records an undo step, changes the state,
   marks it dirty (which triggers autosave), and asks the UI to redraw what changed.

   Renaming: typing in the title field changes the title live, but the rename is only "committed"
   when the field is left or Enter is pressed (commitTitle). Committing checks that the title is
   unique, rewrites [[links]] to the page in every page, and moves the page to a new ID/filename
   (updating children's parentId). Intermediate titles never capture links, and autosave waits
   while state.renameFrom is set. Anything that switches context calls commitTitle() first.

   Depends on: i18n.js, text.js, model.js, markdown.js, state.js, revisions.js, history.js; asks LocalWiki.ui to redraw.
   Provides:   LocalWiki.pages */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {titleKey} = LW.text;
  const {isoNow, uniqueId, pageWithTitle, findLinkTarget, descendantsOf, siblingsOf, placePage, clearOrder} = LW.model;
  const {rewriteLinks} = LW.markdown;
  const state = LW.state;
  const {pageById, currentPage, markDirty, touchPage, forgetPageText} = LW.store;
  const history = LW.history;
  const ui = (LW.ui ||= {});
  const {t} = LW.i18n;

  function selectPage(id) {
    commitTitle();
    if (!pageById(id)) return;
    state.currentId = id;
    ui.renderTree(); ui.renderPage(); LW.store.saveDraft();
  }

  function createPage(parentId = null, desiredTitle = t('default.page_title')) {
    commitTitle();
    const wiki = state.wiki;
    if (parentId && !pageById(parentId)) parentId = null;
    desiredTitle = desiredTitle.normalize('NFC');
    const existing = new Set(wiki.pages.map(p => titleKey(p.title)));
    let title = desiredTitle;
    for (let i = 2; existing.has(titleKey(title)); i++) title = desiredTitle + ' (' + i + ')';
    history.record({key: 'act.create', params: {title}});
    const page = {id: uniqueId(title, [...wiki.pages, ...state.setAside]), title, parentId, tags: [], content: '', icon: '', createdAt: isoNow(), updatedAt: isoNow()};
    wiki.pages.push(page);
    state.indexDirty = true;
    state.changedIds.add(page.id);
    state.currentId = page.id;
    ui.clearSearch();
    markDirty(); ui.renderAll();
    ui.focusTitle();
    return page;
  }

  // Deletes the current page and everything nested under it, after confirmation.
  function deletePage() {
    commitTitle();
    const p = currentPage(); if (!p) return;
    const wiki = state.wiki;
    const ids = descendantsOf(wiki.pages, p.id);
    const children = ids.size - 1;
    if (!confirm(children ? t('confirm.delete_children', {title: p.title, count: children}) : t('confirm.delete_page', {title: p.title}))) return;
    history.record(children ? {key: 'act.delete_children', params: {title: p.title, count: children}} : {key: 'act.delete', params: {title: p.title}});
    for (const id of ids) state.changedIds.delete(id);
    wiki.pages = wiki.pages.filter(x => !ids.has(x.id));
    state.indexDirty = true;
    state.currentId = p.parentId && pageById(p.parentId) ? p.parentId : (wiki.pages[0]?.id || null);
    markDirty(); ui.renderAll(); ui.toast(t('toast.deleted'));
  }

  // --- Title and renaming -------------------------------------------------------------------------
  // Called for each keystroke in the title field.
  function editTitle(value) {
    const p = currentPage(); if (!p) return;
    // The whole title edit, including the rename it commits, is one undo step.
    if (!state.renameFrom) { history.record({key: 'act.rename', params: {title: p.title}}); state.renameFrom = {id: p.id, title: p.title}; }
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
    if (!title) { reject(t('toast.empty_title')); return; }
    const clash = pageWithTitle(wiki.pages, title, oldId);
    if (clash) { reject(t('toast.title_taken', {title: clash.title})); return; }
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
    if (relinked) ui.toast(t('toast.renamed_links', {count: relinked}));
  }

  // --- Other page fields --------------------------------------------------------------------------
  function editTags(text) {
    const p = currentPage(); if (!p) return;
    history.record('act.tags', 'tags:' + p.id);
    p.tags = [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))];
    touchPage(p); ui.renderTreeIfSearching();
  }
  function editContent(text) {
    const p = currentPage(); if (!p) return;
    history.record('act.typing', 'content:' + p.id);
    p.content = text; touchPage(p);
    ui.renderPageStats(); ui.renderMarkdown(); ui.renderTreeIfSearching();
  }
  // parentId: the new parent's id, or null for top level.
  function movePage(parentId) {
    const p = currentPage(); if (!p) return;
    if (parentId && descendantsOf(state.wiki.pages, p.id).has(parentId)) { ui.toast(t('toast.cannot_move')); ui.renderParentChoices(p); return; }
    history.record({key: 'act.move', params: {title: p.title}});
    p.parentId = parentId; touchPage(p);
    ui.renderTree(); ui.renderBreadcrumbs(p); ui.renderParentChoices(p);
  }
  // --- Order in the tree --------------------------------------------------------------------------
  // Pages whose order changed but whose text did not: rewrite their files without stamping a new date.
  function markReordered(ids) {
    for (const id of ids) { const page = pageById(id); if (page) { forgetPageText(page); state.changedIds.add(id); } }
    markDirty();
  }
  // Puts a page under parentId (null: top level), before the page beforeId (null: last).
  // Used by drag and drop and by Move up / Move down.
  function reorderPage(id, parentId, beforeId = null) {
    commitTitle();
    const wiki = state.wiki, page = pageById(id); if (!page || id === beforeId) return;
    if (parentId && (parentId === id || descendantsOf(wiki.pages, id).has(parentId))) { ui.toast(t('toast.cannot_move')); return; }
    // Try it on copies first, so a drop that changes nothing leaves no undo step behind.
    const reparented = (page.parentId ?? null) !== parentId;
    const trial = wiki.pages.map(p => ({...p}));
    const sequence = list => siblingsOf(list, parentId).map(p => p.id).join();
    const was = sequence(trial);
    placePage(trial, id, parentId, beforeId);
    if (!reparented && sequence(trial) === was) return; // dropped where it already is
    history.record({key: reparented ? 'act.move' : 'act.reorder', params: {title: page.title}});
    const changed = placePage(wiki.pages, id, parentId, beforeId);
    if (reparented) touchPage(page);
    markReordered(changed.filter(other => !(reparented && other === id)));
    ui.renderTree();
    const current = currentPage();
    if (current) { ui.renderParentChoices(current); ui.renderBreadcrumbs(current); }
  }
  // Moves the open page one place up (-1) or down (1) among the pages beside it.
  function movePageBy(step) {
    const page = currentPage(); if (!page) return;
    const parentId = page.parentId && pageById(page.parentId) ? page.parentId : null;
    const group = siblingsOf(state.wiki.pages, parentId), at = group.findIndex(p => p.id === page.id);
    const to = at + step;
    if (to < 0 || to >= group.length) return;
    reorderPage(page.id, parentId, step < 0 ? group[to].id : (group[to + 1]?.id ?? null));
  }
  // Forgets all hand-made ordering: every group is alphabetical again.
  function sortAlphabetically() {
    commitTitle();
    if (!state.wiki.pages.some(p => 'order' in p)) { ui.toast(t('toast.sorted')); return; }
    if (!confirm(t('confirm.sort_alpha'))) return;
    history.record('act.sort_alpha');
    markReordered(clearOrder(state.wiki.pages));
    ui.renderTree(); ui.toast(t('toast.sorted'));
  }
  // icon: "icon:<name>", an emoji or symbol, or "" to remove it.
  function setIcon(icon) {
    const page = currentPage(); if (!page) return;
    history.record(icon ? 'act.set_icon' : 'act.remove_icon');
    page.icon = icon; touchPage(page);
    ui.renderPageIcon(page); ui.renderTree();
  }

  // Clicking a [[link]]: go to the page, or offer to create it.
  function openLink(target) {
    const match = findLinkTarget(state.wiki.pages, target);
    if (match) selectPage(match.id);
    else if (confirm(t('confirm.create_missing', {title: target}))) createPage(null, target.slice(0, 140));
  }

  // --- Saved revisions (see revisions.js) ---------------------------------------------------------
  // Brings back an earlier version's text, tags and icon. Title and position stay as they are.
  function restoreRevision(revision) {
    const page = currentPage(); if (!page) return;
    history.record({key: 'act.restore_version', params: {title: page.title}});
    page.content = revision.content;
    page.tags = [...(revision.tags || [])];
    page.icon = revision.icon || '';
    touchPage(page);
    ui.renderPage(); ui.renderTree();
    ui.toast(t('toast.restored_version'));
  }
  // Brings back a deleted page from its newest revision (file: from revisions.deletedPages()).
  function restoreDeleted(file) {
    commitTitle();
    const wiki = state.wiki;
    const revision = file.revisions[file.revisions.length - 1];
    const existing = new Set(wiki.pages.map(p => titleKey(p.title)));
    let title = revision.title;
    for (let i = 2; existing.has(titleKey(title)); i++) title = revision.title + ' (' + i + ')';
    history.record({key: 'act.restore_page', params: {title}});
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
    ui.toast(t('toast.restored_page', {title}));
  }

  // Wiki settings (the settings dialog): {name, appearance: {appName, icon, palette}, logo}.
  // logo is the picture as a PNG data URL when appearance.icon is "image". One undo step.
  function updateSettings({name, appearance, logo}) {
    const wiki = state.wiki;
    const next = {name: (name || '').trim().slice(0, 140) || wiki.name, appearance: LW.model.normalizeAppearance(appearance)};
    const nextLogo = next.appearance.icon === 'image' ? logo || null : null;
    if (next.appearance.icon === 'image' && !nextLogo) next.appearance.icon = '';
    if (next.name === wiki.name && JSON.stringify(next.appearance) === JSON.stringify(wiki.appearance) && nextLogo === state.logo) return;
    history.record('act.settings');
    wiki.name = next.name;
    wiki.appearance = next.appearance;
    if (nextLogo !== state.logo) { state.logo = nextLogo; state.logoDirty = true; }
    state.indexDirty = true; markDirty(); ui.renderAll();
  }

  LW.pages = {selectPage, createPage, deletePage, editTitle, commitTitle, editTags, editContent, movePage, reorderPage, movePageBy, sortAlphabetically, setIcon, openLink, restoreRevision, restoreDeleted, updateSettings};
})();
