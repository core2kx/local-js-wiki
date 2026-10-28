/* LocalWiki — model.js
   The page data model: what a valid page looks like, how damaged pages are repaired, the
   parent/child tree, and how page IDs and file paths are chosen.

   A page is a plain object, saved as pages/<id>.json:
     { id, title, parentId, tags, content, icon, createdAt, updatedAt }
   - id:       slug of the title (see text.slug); always matches the filename
   - parentId: id of the parent page, or null for a top-level page
   - content:  Markdown text; icon: "icon:<name>" (bundled SVG), an emoji/symbol, or ""

   Pure functions (they take the page list as an argument): no page (DOM) access; runs under Node.
   Depends on: i18n.js, text.js
   Provides:   LocalWiki.model */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {slug, titleKey} = LW.text;

  function isoNow() { return new Date().toISOString(); }

  // --- IDs and paths ------------------------------------------------------------------------------
  function pathFor(id) { return 'pages/' + id + '.json'; }
  // A page path we are willing to read or write: pages/<letters or digits...>.json, nothing else.
  const PAGE_PATH = /^pages\/[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]*\.json$/u;
  // existing: everything that already owns a filename (pages and set-aside entries), as {id} objects.
  function uniqueId(title, existing, selfId = null) {
    const base = slug(title);
    // Compare upper-cased so names that differ only in case (or final sigma) do not
    // collide on case-insensitive file systems.
    const taken = new Set([...existing].filter(p => p.id !== selfId).map(p => p.id.toUpperCase()));
    let id = base;
    for (let i = 2; taken.has(id.toUpperCase()); i++) id = base + '-' + i;
    return id;
  }

  // --- Finding pages ------------------------------------------------------------------------------
  function pageWithTitle(pages, title, selfId = null) {
    const key = titleKey(title);
    return pages.find(p => p.id !== selfId && titleKey(p.title) === key);
  }
  // What to write inside [[ ]] to link to a page: its title, or its ID when the title contains
  // characters that would break the link syntax ([, ] or |).
  function linkTargetFor(page) { return /[\[\]|\n]/.test(page.title) ? page.id : page.title; }
  // What a [[link]] points to: a page ID first, otherwise a case-insensitive title.
  function findLinkTarget(pages, target) {
    return pages.find(p => p.id === target) || pages.find(p => titleKey(p.title) === titleKey(target));
  }
  // Pages beside each other in the tree: the ones placed by hand (a whole-number "order") first, in
  // that order, then everything else alphabetically.
  function sortSiblings(list) {
    const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, {sensitivity:'base', numeric:true});
    const placed = list.filter(p => Number.isInteger(p.order)).sort((a, b) => a.order - b.order || byTitle(a, b));
    return [...placed, ...list.filter(p => !Number.isInteger(p.order)).sort(byTitle)];
  }
  // The pages directly under parentId (null: the top level, which also holds pages whose parent is missing).
  function siblingsOf(pages, parentId) {
    const known = new Set(pages.map(p => p.id));
    return sortSiblings(pages.filter(p => parentId === null ? !p.parentId || !known.has(p.parentId) : p.parentId === parentId));
  }
  // Puts a page under parentId (null: top level), just before the page beforeId (null: last), and
  // numbers that group so the order sticks. Returns the ids of the pages that changed.
  // The caller makes sure the page is not moved inside itself.
  function placePage(pages, id, parentId, beforeId) {
    const page = pages.find(p => p.id === id);
    const group = siblingsOf(pages, parentId).filter(p => p.id !== id);
    const at = beforeId === null ? -1 : group.findIndex(p => p.id === beforeId);
    group.splice(at < 0 ? group.length : at, 0, page);
    const changed = [];
    if ((page.parentId ?? null) !== parentId) { page.parentId = parentId; changed.push(id); }
    group.forEach((p, index) => {
      if (p.order !== index) { p.order = index; if (!changed.includes(p.id)) changed.push(p.id); }
    });
    return changed;
  }
  // Forgets every hand-made order, so all pages are alphabetical again. Returns the ids that changed.
  function clearOrder(pages) {
    const changed = [];
    for (const p of pages) if ('order' in p) { delete p.order; changed.push(p.id); }
    return changed;
  }
  function sortByTitle(list) {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, {sensitivity:'base', numeric:true}));
  }

  // --- Tree ---------------------------------------------------------------------------------------
  // The page and everything nested under it (a page cannot be moved into this set).
  function descendantsOf(pages, id) {
    const descendants = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of pages) {
        if (!descendants.has(p.id) && descendants.has(p.parentId)) { descendants.add(p.id); changed = true; }
      }
    }
    return descendants;
  }
  // Parent, grandparent, ... ordered from the top level down. Stops at a missing parent or a loop.
  function ancestors(pages, page) {
    const result = [];
    const seen = new Set([page.id]);
    let parentId = page.parentId;
    while (parentId && !seen.has(parentId)) {
      const p = pages.find(x => x.id === parentId);
      if (!p) break;
      seen.add(parentId);
      result.unshift(p);
      parentId = p.parentId;
    }
    return result;
  }

  // --- Appearance (wiki.json "appearance") --------------------------------------------------------
  // {appName, icon, palette}: the name shown in the top bar, the wiki's icon (also the browser-tab
  // icon) and the color palette (see palettes.js). icon is "" (default), "icon:<name>" (bundled SVG),
  // "image" (the picture saved as branding/logo.png), or a short emoji/symbol.
  const DEFAULT_APP_NAME = 'LocalWiki';
  const LOGO_PATH = 'branding/logo.png';
  function defaultAppearance() { return {appName: DEFAULT_APP_NAME, icon: '', palette: 'evergreen'}; }
  function normalizeAppearance(raw) {
    const appearance = defaultAppearance();
    if (!raw || typeof raw !== 'object') return appearance;
    if (typeof raw.appName === 'string' && raw.appName.trim()) appearance.appName = raw.appName.trim().normalize('NFC').slice(0, 40);
    if (typeof raw.icon === 'string') {
      const icon = raw.icon.trim();
      if (icon === 'image' || /^icon:[a-z0-9-]+$/.test(icon) || (icon && !icon.startsWith('icon:') && [...icon].length <= 8)) appearance.icon = icon;
    }
    if (typeof raw.palette === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.palette)) appearance.palette = raw.palette;
    return appearance;
  }

  // --- Validation and repair ----------------------------------------------------------------------
  // Validates one page object. Throws (the page is set aside) when using it would lose data, e.g. a
  // title or content that is not text. Missing fields get defaults and are reported as repairs.
  function normalizePage(raw, id) {
    // Problems are reported as translatable {key, params} messages (see i18n.js), not as sentences.
    const {error} = LW.i18n;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error('page.err_not_object');
    if (raw.title !== undefined && typeof raw.title !== 'string') throw error('page.err_title');
    if (raw.content !== undefined && typeof raw.content !== 'string') throw error('page.err_content');
    const notes = [];
    if (raw.id !== id) notes.push(raw.id === undefined ? {key: 'page.note_id_missing'} : {key: 'page.note_id_mismatch', params: {id: JSON.stringify(raw.id)}});
    let title = typeof raw.title === 'string' ? raw.title.trim().normalize('NFC') : '';
    if (!title) { title = id; notes.push({key: 'page.note_no_title'}); }
    if (title.length > 140) { title = title.slice(0, 140); notes.push({key: 'page.note_title_long'}); }
    if (raw.content === undefined) notes.push({key: 'page.note_no_content'});
    const page = {
      id, title,
      parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null,
      tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string').map(t => t.slice(0, 80)) : [],
      content: raw.content ?? '',
      icon: typeof raw.icon === 'string' ? raw.icon.slice(0, 60) : '',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : isoNow(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : isoNow()
    };
    if (Number.isInteger(raw.order) && Math.abs(raw.order) < 1e9) page.order = raw.order; // placed by hand
    return {page, notes};
  }
  // Fixes cross-page problems in place. report(page, message, repaired): message is {key, params}
  // (a translatable phrase that continues "This page …"); repaired pages need rewriting.
  function repairStructure(pages, report) {
    const titles = new Set();
    for (const p of pages) {
      let title = p.title;
      for (let i = 2; titles.has(titleKey(title)); i++) title = `${p.title} (${i})`;
      if (title !== p.title) { report(p, {key: 'page.fix_duplicate_title', params: {title}}, true); p.title = title; }
      titles.add(titleKey(title));
    }
    const byId = new Map(pages.map(p => [p.id, p]));
    for (const p of pages) {
      const seen = new Set([p.id]);
      for (let q = p; q.parentId && byId.has(q.parentId); q = byId.get(q.parentId)) {
        if (seen.has(q.parentId)) { report(q, {key: 'page.fix_loop'}, true); q.parentId = null; break; }
        seen.add(q.parentId);
      }
    }
    // A missing parent is kept in the data (it may be a set-aside page that gets fixed) and shown at top level.
    for (const p of pages) {
      if (p.parentId && !byId.has(p.parentId)) report(p, {key: 'page.fix_parent_missing', params: {parent: p.parentId}}, false);
    }
  }
  // For in-browser data (drafts, new wikis): drop anything invalid rather than failing.
  function normalizeWiki(input) {
    const pages = [], ids = new Set();
    for (const raw of Array.isArray(input?.pages) ? input.pages : []) {
      if (typeof raw?.id !== 'string' || !raw.id || ids.has(raw.id)) continue;
      try { pages.push(normalizePage(raw, raw.id).page); ids.add(raw.id); } catch (_) { /* skip */ }
    }
    repairStructure(pages, () => {});
    return {
      name: typeof input?.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 140) : 'Untitled Wiki',
      appearance: normalizeAppearance(input?.appearance),
      pages
    };
  }

  LW.model = {
    isoNow, pathFor, PAGE_PATH, uniqueId, pageWithTitle, findLinkTarget, linkTargetFor, sortByTitle,
    sortSiblings, siblingsOf, placePage, clearOrder,
    descendantsOf, ancestors, normalizePage, repairStructure, normalizeWiki,
    DEFAULT_APP_NAME, LOGO_PATH, defaultAppearance, normalizeAppearance
  };
})();
