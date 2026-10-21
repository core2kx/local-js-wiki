/* LocalWiki: browser-only wiki with one JSON file per page. No backend or build step.
   A small wiki.json index records paths; localStorage is only a crash-recovery draft.
   Markdown is deliberately a safe, compact subset, not a full CommonMark engine. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const els = {
    name: $('wiki-name'), status: $('save-status'), open: $('open-btn'), save: $('save-btn'),
    saveAs: $('save-as-btn'), exportZip: $('export-zip-btn'),
    folderInput: $('folder-input'), newWiki: $('new-wiki-btn'),
    rename: $('rename-wiki-btn'), theme: $('theme-btn'), fileLabel: $('file-label'),
    search: $('search'), sidebarHeading: $('sidebar-heading'), nav: $('page-nav'),
    newPage: $('new-page-btn'), newChild: $('new-child-btn'), del: $('delete-page-btn'),
    pageWidth: $('page-width-select'), pageIconButton: $('page-icon-btn'), pageIconDisplay: $('page-icon-display'),
    breadcrumbs: $('breadcrumbs'), title: $('page-title'), modified: $('page-modified'),
    count: $('page-word-count'), parent: $('parent-select'), tags: $('tags-input'),
    content: $('content-input'), preview: $('preview'), card: $('editor-content'),
    toolbar: $('editor-toolbar'), pageId: $('page-id-short'),
    empty: $('empty-state'), mainPage: document.querySelector('.page-wrap'),
    emptyCreate: $('empty-create-btn'), toast: $('toast'),
    tableDialog: $('table-dialog'), tableTitle: $('table-dialog-title'),
    tableGrid: $('table-builder-grid'), tableSize: $('table-size'),
    tableConfirm: $('table-confirm'), tableAddRow: $('table-add-row'), tableRemoveRow: $('table-remove-row'),
    tableAddCol: $('table-add-col'), tableRemoveCol: $('table-remove-col'),
    pickerDialog: $('picker-dialog'), pickerSearch: $('picker-search'),
    pickerResults: $('picker-results'), pickerClear: $('picker-clear'), pickerHint: $('picker-hint'),
    undo: $('undo-btn'), redo: $('redo-btn'),
    problemsDialog: $('problems-dialog'), problemsList: $('problems-list'), problemsButton: $('problems-btn')
  };
  const DRAFT_KEY = 'localwiki:draft';
  const UI_KEY = 'localwiki:ui';
  const SCHEMA_VERSION = 1; // wiki.json format version
  let wiki;
  let currentId;
  let folderHandle = null;
  let folderName = 'No folder selected';
  let dirty = false;
  let indexDirty = false;
  let changeVersion = 0;
  let saving = false;
  let lastSavedAt = null;
  let autosaveTimer = null;
  let dirtySince = 0;        // when the oldest unsaved change was made (for the autosave ceiling)
  const AUTOSAVE_DELAY = 2000, AUTOSAVE_MAX_WAIT = 15000;
  // Session undo/redo: each entry is the whole wiki before (undo) or after (redo) one step.
  // Pages are stored as JSON strings; unchanged pages share the same string between entries.
  let undoStack = [], redoStack = [];
  let undoGroup = null;      // {key, started, last} for coalescing bursts of typing
  const UNDO_LIMIT = 200, UNDO_PAUSE = 1000, UNDO_MAX_GROUP = 10000;
  const pageText = new WeakMap(); // page object -> JSON string; cleared by touchPage
  let changedIds = new Set();
  let diskPaths = new Set(); // page files known to exist in the linked folder
  let renameFrom = null;     // {id, title} while the title field has an uncommitted edit
  // Pages that could not be loaded: {id, file, text}. Their files are never written or deleted,
  // they stay listed in wiki.json, and text (the raw file, or null if unreadable) is copied verbatim
  // when the wiki is saved elsewhere or exported.
  let setAside = [];
  let copySetAside = false;  // true for a save to a new folder
  let loadProblems = [];     // [{file, message, kind}] from the last open
  let mode = 'split';
  let pageWidth = '90';
  let toastTimeout;
  const iconLibrary = window.LocalWikiIcons;
  let pickerTarget = 'body';
  let pickerTab = 'icons';
  let pickerCaret = 0;
  let tableDraft = null;
  const PICKER_SYMBOLS = [
    ['✓','Check mark'], ['✔','Heavy check'], ['✕','Cross'], ['☐','Checkbox empty'], ['☑','Checkbox checked'],
    ['★','Filled star'], ['☆','Empty star'], ['●','Filled circle'], ['○','Empty circle'], ['◆','Diamond'],
    ['→','Arrow right'], ['←','Arrow left'], ['↑','Arrow up'], ['↓','Arrow down'], ['↔','Arrow both ways'],
    ['⇒','Double arrow'], ['↳','Return arrow'], ['∞','Infinity'], ['≈','Approximately'], ['≠','Not equal'],
    ['≤','Less than equal'], ['≥','Greater than equal'], ['±','Plus minus'], ['×','Multiply'], ['÷','Divide'],
    ['°','Degree'], ['µ','Micro'], ['Ω','Ohm'], ['Δ','Delta'], ['π','Pi'], ['Σ','Sigma'], ['∑','Summation'],
    ['§','Section'], ['¶','Paragraph'], ['©','Copyright'], ['®','Registered'], ['™','Trademark'],
    ['€','Euro'], ['£','Pound'], ['¥','Yen'], ['•','Bullet'], ['…','Ellipsis'], ['—','Em dash'],
    ['–','En dash'], ['⚠','Warning'], ['ℹ','Information'], ['⌘','Command'], ['⏎','Return'], ['⌫','Backspace'],
    ['⏻','Power'], ['⏱','Stopwatch']
  ];
  const PICKER_EMOJI = [
    ['📌','Pin'], ['📄','Document'], ['📁','Folder'], ['📚','Books'], ['🔧','Wrench'], ['⚙️','Settings'],
    ['💻','Computer'], ['🖥️','Desktop'], ['🗄️','Cabinet'], ['📡','Antenna'], ['🌐','Network'],
    ['🛡️','Shield'], ['🔒','Locked'], ['🔓','Unlocked'], ['✅','Complete'], ['❌','Error'], ['⚠️','Warning'],
    ['🚀','Rocket'], ['🧪','Test'], ['📝','Notes'], ['💡','Idea'], ['📅','Calendar'], ['⏰','Alarm'],
    ['🔗','Link'], ['⭐','Star'], ['🎯','Target'], ['📦','Package'], ['🔌','Plug'], ['🔋','Battery'],
    ['🚨','Alert'], ['🛰️','Satellite'], ['🖨️','Printer'], ['🧭','Compass'], ['🔍','Search'],
    ['🧱','Building blocks'], ['📊','Chart'], ['📋','Clipboard'], ['🏷️','Tag'], ['👤','Person']
  ];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  // Page IDs are slugs of the title in any script; a page's file is always pages/<id>.json.
  // Latin accents are simplified (Café -> cafe); other scripts are kept as-is (Привет -> привет).
  const RESERVED_NAMES = new Set(['con','prn','aux','nul','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9']);
  const SLUG_MAX_CHARS = 60, SLUG_MAX_BYTES = 150; // well under the 255-byte filename limit
  const utf8 = new TextEncoder();
  const graphemeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
  const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'word'}) : null;
  // Nearest grapheme start at or before offset, so snippets never cut a character in half.
  function graphemeBoundary(text, offset) {
    if (offset <= 0 || offset >= text.length) return offset;
    let start = 0;
    for (const char of graphemes(text)) { if (start + char.length > offset) break; start += char.length; }
    return start;
  }
  function graphemes(text) {
    return graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), part => part.segment) : Array.from(text);
  }
  function slug(value, fallback = 'page') {
    const text = String(value || '').normalize('NFKD').toLowerCase()
      .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
      .normalize('NFC')
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^[-\p{M}]+/u, '');
    // Truncate on whole characters (never splitting a letter from its marks) within the byte budget.
    let base = '', bytes = 0, count = 0;
    for (const char of graphemes(text)) {
      const size = utf8.encode(char).length;
      if (count >= SLUG_MAX_CHARS || bytes + size > SLUG_MAX_BYTES) break;
      base += char; bytes += size; count++;
    }
    base = base.replace(/-+$/, '');
    if (!base) return fallback;
    return RESERVED_NAMES.has(base) ? base + '-page' : base;
  }
  // Case-insensitive key for titles: canonical Unicode form, locale-independent folding
  // (so "Straße"/"STRASSE" and "ΟΔΟΣ"/"οδος" match identically on every machine).
  function titleKey(title) { return String(title).normalize('NFC').toUpperCase().toLowerCase(); }
  // Search folding: case- and accent-insensitive ("cafe" finds "Café", "αθηνα" finds "Αθήνα").
  // Marks are only stripped from the general diacritics block, so Indic, Thai, Arabic and Hebrew
  // vowel signs still count. Cyrillic keeps й (a distinct letter); only ё is folded to е.
  const SEARCH_LETTERS = {'ø':'o', 'æ':'ae', 'œ':'oe', 'ł':'l', 'đ':'d', 'ð':'d', 'þ':'th'};
  function foldGrapheme(char) {
    const lower = char.normalize('NFC').toUpperCase().toLowerCase();
    if (/^\p{Script=Cyrillic}/u.test(lower)) return lower.replace(/ё/g, 'е');
    return lower.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[øæœłđðþ]/g, c => SEARCH_LETTERS[c]).normalize('NFC');
  }
  // Returns the folded text plus map[i] = offset in the original text of folded character i,
  // so a match in folded text can be highlighted in the original.
  const foldCache = new Map();
  function foldForSearch(text) {
    let result = foldCache.get(text);
    if (result) return result;
    let folded = '', offset = 0;
    const map = [];
    for (const char of graphemes(text)) {
      const f = foldGrapheme(char);
      folded += f;
      for (let k = 0; k < f.length; k++) map.push(offset);
      offset += char.length;
    }
    map.push(text.length);
    result = {folded, map};
    if (foldCache.size > 1000) foldCache.clear();
    foldCache.set(text, result);
    return result;
  }
  function searchFold(text) { return foldForSearch(text).folded; }
  // Original [start, end) for a match at folded index i with folded length n.
  function originalRange({map}, i, n) {
    let j = i + n;
    while (j < map.length - 1 && map[j] === map[j - 1]) j++; // end on a whole original character
    return [map[i], map[j]];
  }
  function uniqueId(title, selfId = null) {
    const base = slug(title);
    // Compare upper-cased so names that differ only in case (or final sigma) do not
    // collide on case-insensitive file systems.
    const taken = new Set([...wiki.pages.filter(p => p.id !== selfId), ...setAside].map(p => p.id.toUpperCase()));
    let id = base;
    for (let i = 2; taken.has(id.toUpperCase()); i++) id = base + '-' + i;
    return id;
  }
  function pathFor(id) { return 'pages/' + id + '.json'; }
  const PAGE_PATH = /^pages\/[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]*\.json$/u;
  function pageWithTitle(title, selfId = null) {
    const key = titleKey(title);
    return wiki.pages.find(p => p.id !== selfId && titleKey(p.title) === key);
  }
  function isoNow() { return new Date().toISOString(); }
  function pageById(id) { return wiki.pages.find(p => p.id === id); }
  function currentPage() { return pageById(currentId); }
  function descendantsOf(id) {
    const descendants = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of wiki.pages) {
        if (!descendants.has(p.id) && descendants.has(p.parentId)) { descendants.add(p.id); changed = true; }
      }
    }
    return descendants;
  }
  function ancestors(page) {
    const result = [];
    const seen = new Set([page.id]);
    let parentId = page.parentId;
    while (parentId && !seen.has(parentId)) {
      const p = pageById(parentId);
      if (!p) break;
      seen.add(parentId);
      result.unshift(p);
      parentId = p.parentId;
    }
    return result;
  }
  function shortDate(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(date);
  }
  // Validates one page object. Throws (the page is set aside) when using it would lose data, e.g. a
  // title or content that is not text. Missing fields get defaults and are reported as repairs.
  function normalizePage(raw, id) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('is not a JSON object');
    if (raw.title !== undefined && typeof raw.title !== 'string') throw new Error('has a "title" that is not text');
    if (raw.content !== undefined && typeof raw.content !== 'string') throw new Error('has "content" that is not text');
    const notes = [];
    if (raw.id !== id) notes.push(raw.id === undefined ? 'its "id" was missing' : `its "id" (${JSON.stringify(raw.id)}) did not match the filename`);
    let title = typeof raw.title === 'string' ? raw.title.trim().normalize('NFC') : '';
    if (!title) { title = id; notes.push('it had no title, so the filename is used'); }
    if (title.length > 140) { title = title.slice(0, 140); notes.push('its title was shortened to 140 characters'); }
    if (raw.content === undefined) notes.push('it had no "content"');
    const page = {
      id, title,
      parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null,
      tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string').map(t => t.slice(0, 80)) : [],
      content: raw.content ?? '',
      icon: typeof raw.icon === 'string' ? raw.icon.slice(0, 60) : '',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : isoNow(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : isoNow()
    };
    return {page, notes};
  }
  // Fixes cross-page problems in place. report(page, message, repaired): repaired pages need rewriting.
  function repairStructure(pages, report) {
    const titles = new Set();
    for (const p of pages) {
      let title = p.title;
      for (let i = 2; titles.has(titleKey(title)); i++) title = `${p.title} (${i})`;
      if (title !== p.title) { report(p, `had the same title as another page, so it was renamed to "${title}"`, true); p.title = title; }
      titles.add(titleKey(title));
    }
    const byId = new Map(pages.map(p => [p.id, p]));
    for (const p of pages) {
      const seen = new Set([p.id]);
      for (let q = p; q.parentId && byId.has(q.parentId); q = byId.get(q.parentId)) {
        if (seen.has(q.parentId)) { report(q, 'was part of a parent loop, so it was moved to the top level', true); q.parentId = null; break; }
        seen.add(q.parentId);
      }
    }
    // A missing parent is kept in the data (it may be a set-aside page that gets fixed) and shown at top level.
    for (const p of pages) {
      if (p.parentId && !byId.has(p.parentId)) report(p, `has parent "${p.parentId}", which is not loaded, so it is shown at the top level`, false);
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
      pages
    };
  }
  function toast(message) {
    clearTimeout(toastTimeout);
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    toastTimeout = setTimeout(() => els.toast.classList.remove('visible'), 4000);
  }
  function backupDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({wiki, currentId, folderName, dirty, renameFrom, setAside})); }
    catch (err) { console.warn('Local draft recovery unavailable:', err); }
  }
  function markDirty() {
    if (!dirtySince) dirtySince = Date.now();
    dirty = true;
    changeVersion++;
    wiki.updatedAt = isoNow();
    setSaveStatus();
    backupDraft();
    scheduleAutosave();
  }
  function setSaveStatus() {
    const time = lastSavedAt ? new Intl.DateTimeFormat(undefined, {timeStyle: 'short'}).format(lastSavedAt) : '';
    els.status.textContent = saving ? '◌ Saving…' : dirty ? '● Unsaved changes' :
      folderHandle ? (time ? '✓ Saved at ' + time : '✓ Saved to folder') : '◌ No linked folder';
    els.status.classList.toggle('is-dirty', dirty && !saving);
    els.fileLabel.textContent = folderName + (folderHandle ? ' · Linked folder · Autosave on' : ' · Not linked');
  }
  function touchPage(page) { page.updatedAt = isoNow(); pageText.delete(page); changedIds.add(page.id); markDirty(); }

  // Autosave: only into a linked, writable folder; waits for a pause in editing (with a ceiling for
  // continuous typing) and never saves a half-typed title.
  function scheduleAutosave(delay = AUTOSAVE_DELAY) {
    clearTimeout(autosaveTimer);
    if (!folderHandle || !dirty) return;
    const wait = Math.max(0, Math.min(delay, dirtySince + AUTOSAVE_MAX_WAIT - Date.now()));
    autosaveTimer = setTimeout(autosave, wait);
  }
  function autosave() {
    if (!folderHandle || !dirty) return;
    if (saving || renameFrom) { scheduleAutosave(); return; }
    saveChanges({auto: true});
  }

  // Undo/redo.
  function serializePage(page) {
    let text = pageText.get(page);
    if (text === undefined) { text = JSON.stringify(page); pageText.set(page, text); }
    return text;
  }
  function snapshot(label) {
    return {label, name: wiki.name, currentId, pages: wiki.pages.map(serializePage)};
  }
  function sameState(a, b) {
    return a.name === b.name && a.pages.length === b.pages.length && a.pages.every((text, i) => text === b.pages[i]);
  }
  // Call before changing anything. Changes with the same key in quick succession (typing) share one step.
  function recordUndo(label, key = null) {
    const now = Date.now();
    const g = undoGroup;
    if (key && g && g.key === key && now - g.last < UNDO_PAUSE && now - g.started < UNDO_MAX_GROUP) { g.last = now; return; }
    undoGroup = key ? {key, started: now, last: now} : null;
    const entry = snapshot(label);
    if (undoStack.length && sameState(undoStack[undoStack.length - 1], entry)) return;
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    renderUndoButtons();
  }
  function restore(entry) {
    const before = new Map(wiki.pages.map(page => [page.id, serializePage(page)]));
    const pages = entry.pages.map(text => { const page = JSON.parse(text); pageText.set(page, text); return page; });
    const ids = new Set(pages.map(page => page.id));
    if (wiki.name !== entry.name || before.size !== ids.size || [...ids].some(id => !before.has(id))) indexDirty = true;
    wiki.name = entry.name;
    wiki.pages = pages;
    // Rewrite every page that differs from what was there; undone deletions are written back too.
    for (const page of pages) if (before.get(page.id) !== pageText.get(page)) changedIds.add(page.id);
    currentId = pageById(entry.currentId) ? entry.currentId : (pageById(currentId) ? currentId : pages[0]?.id || null);
    renameFrom = null; undoGroup = null;
    markDirty();
    renderAll();
  }
  function stepHistory(from, to, verb) {
    commitTitle();
    const entry = from.pop();
    if (!entry) return;
    to.push(snapshot(entry.label));
    const oldContent = currentPage()?.content;
    restore(entry);
    // Put the caret where the text changed, if the step changed the open page's text.
    const page = currentPage();
    if (page && oldContent !== undefined && oldContent !== page.content) {
      let i = 0;
      while (i < page.content.length && page.content[i] === oldContent[i]) i++;
      els.content.setSelectionRange(i, i);
    }
    renderUndoButtons();
    toast(verb + ' ' + entry.label + '.');
  }
  function undo() { stepHistory(undoStack, redoStack, 'Undid'); }
  function redo() { stepHistory(redoStack, undoStack, 'Redid'); }
  // A title edit that ended up changing nothing (rejected, or retyped as before) should not linger as
  // a no-op undo step. Typing touched the page's updatedAt, so restore that from the step first.
  function dropNoopUndo(page) {
    const top = undoStack[undoStack.length - 1];
    const i = wiki.pages.indexOf(page);
    if (!top || top.pages.length !== wiki.pages.length || i < 0) return;
    const previous = JSON.parse(top.pages[i]);
    if (previous.id !== page.id) return;
    page.updatedAt = previous.updatedAt; pageText.delete(page);
    if (sameState(top, snapshot(top.label))) { undoStack.pop(); renderUndoButtons(); }
  }
  function clearHistory() { undoStack = []; redoStack = []; undoGroup = null; renderUndoButtons(); }
  function renderUndoButtons() {
    const u = undoStack[undoStack.length - 1], r = redoStack[redoStack.length - 1];
    els.undo.disabled = !u; els.undo.title = u ? 'Undo ' + u.label : 'Nothing to undo';
    els.redo.disabled = !r; els.redo.title = r ? 'Redo ' + r.label : 'Nothing to redo';
  }
  function sorted(list) { return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, {sensitivity:'base', numeric:true})); }

  // Query terms are whitespace-separated words or "quoted phrases" (an unclosed quote runs to the
  // end, so typing a phrase works). A page matches when every term appears in its title, tags or text.
  function searchTerms(raw) {
    const terms = [];
    for (const [, phrase, word] of raw.matchAll(/"([^"]*)"?|(\S+)/g)) {
      const term = searchFold((phrase ?? word).trim().replace(/\s+/g, ' '));
      if (term && !terms.includes(term)) terms.push(term);
    }
    return terms;
  }
  function scorePage(p, terms, phrase) {
    const title = searchFold(p.title);
    const tags = searchFold(p.tags.join(' '));
    const body = foldForSearch(p.content);
    let score = 0;
    for (const term of terms) {
      const best = title.includes(term) ? 3 : tags.includes(term) ? 2 : body.folded.includes(term) ? 1 : 0;
      if (!best) return null;
      score += best;
    }
    // Rank an exact title match first, and pages containing the words side by side above scattered ones.
    if (title === phrase) score += 10;
    else if (terms.length > 1 && (title.includes(phrase) || body.folded.includes(phrase))) score += 1;
    return {p, score, body};
  }
  function appendSnippet(snippet, p, body, terms, phrase) {
    const text = p.content;
    const ranges = [];
    for (const term of terms) {
      for (let i = body.folded.indexOf(term), n = 0; i >= 0 && n < 50; i = body.folded.indexOf(term, i + term.length), n++) {
        ranges.push(originalRange(body, i, term.length));
      }
    }
    if (!ranges.length) {
      const cleaned = text.replace(/[#*`\[\]|]/g, '').replace(/\s+/g, ' ');
      snippet.textContent = p.tags.join(', ') || graphemes(cleaned).slice(0, 85).join('');
      return;
    }
    // Centre on the words side by side if they occur that way, otherwise on the earliest match.
    const at = terms.length > 1 ? body.folded.indexOf(phrase) : -1;
    const anchor = at >= 0 ? originalRange(body, at, phrase.length)[0] : Math.min(...ranges.map(r => r[0]));
    const from = graphemeBoundary(text, Math.max(0, anchor - 30));
    const to = graphemeBoundary(text, Math.min(text.length, anchor + 110));
    const visible = ranges.map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
      .filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0]);
    const clean = value => value.replace(/\s+/g, ' ');
    let cursor = from;
    snippet.append(from > 0 ? '…' : '');
    for (const [start, end] of visible) {
      if (end <= cursor) continue; // overlaps a highlight already shown
      const begin = Math.max(start, cursor);
      const mark = document.createElement('mark'); mark.textContent = text.slice(begin, end);
      snippet.append(clean(text.slice(cursor, begin)), mark);
      cursor = end;
    }
    snippet.append(clean(text.slice(cursor, to)) + (to < text.length ? '…' : ''));
  }
  function renderTree() {
    const raw = els.search.value.trim();
    els.sidebarHeading.textContent = raw ? 'Search results' : 'Pages';
    els.nav.replaceChildren();
    if (raw) {
      const terms = searchTerms(raw);
      const phrase = searchFold(raw.replace(/"/g, ' ').trim().replace(/\s+/g, ' '));
      const matches = !terms.length ? [] : wiki.pages.map(p => scorePage(p, terms, phrase))
        .filter(Boolean).sort((a,b) => b.score - a.score || a.p.title.localeCompare(b.p.title));
      for (const {p, body} of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nav-entry nav-result' + (p.id === currentId ? ' active' : '');
        const title = document.createElement('span');
        title.className = 'nav-result-title'; title.dir = 'auto'; title.textContent = p.title || 'Untitled page';
        const path = document.createElement('span');
        path.className = 'nav-result-path'; path.textContent = ancestors(p).map(x => x.title).join(' / ') || 'Top-level';
        const snippet = document.createElement('span'); snippet.className = 'nav-result-snippet';
        snippet.dir = 'auto';
        appendSnippet(snippet, p, body, terms, phrase);
        button.append(title, path, snippet);
        button.addEventListener('click', () => selectPage(p.id));
        els.nav.append(button);
      }
      if (!matches.length) {
        const noResults = document.createElement('div');
        noResults.className = 'search-empty'; noResults.textContent = 'No matching pages.';
        els.nav.append(noResults);
      }
      return;
    }
    if (!wiki.pages.length) {
      const blank = document.createElement('div'); blank.className = 'search-empty';
      blank.textContent = 'No pages yet. Select + to create one.';
      els.nav.append(blank);
      return;
    }
    const isRoot = p => !p.parentId || !pageById(p.parentId);
    const visit = (parentId, container) => {
      for (const page of sorted(wiki.pages.filter(p => parentId === null ? isRoot(p) : p.parentId === parentId))) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.title = page.title;
        btn.className = 'nav-entry' + (page.id === currentId ? ' active' : '');
        const icon = document.createElement('span'); icon.className = 'nav-page-icon'; fillPageIcon(icon, page);
        const name = document.createElement('span'); name.className = 'nav-title'; name.dir = 'auto'; name.textContent = page.title || 'Untitled page';
        btn.append(icon, name);
        btn.addEventListener('click', () => selectPage(page.id));
        container.append(btn);
        if (wiki.pages.some(p => p.parentId === page.id)) {
          const group = document.createElement('div'); group.className = 'nav-group';
          container.append(group); visit(page.id, group);
        }
      }
    };
    visit(null, els.nav);
  }

  function renderBreadcrumbs(p) {
    els.breadcrumbs.replaceChildren();
    const path = [...ancestors(p), p];
    path.forEach((ancestor, i) => {
      if (i) { const slash = document.createElement('span'); slash.textContent = '/'; els.breadcrumbs.append(slash); }
      if (i === path.length - 1) {
        const label = document.createElement('span'); label.textContent = ancestor.title || 'Untitled';
        els.breadcrumbs.append(label);
      } else {
        const button = document.createElement('button'); button.className = 'crumb-button';
        button.textContent = ancestor.title || 'Untitled';
        button.addEventListener('click', () => selectPage(ancestor.id));
        els.breadcrumbs.append(button);
      }
    });
  }
  function renderParentChoices(p) {
    els.parent.replaceChildren();
    const none = new Option('Top-level page', ''); els.parent.add(none);
    const unavailable = descendantsOf(p.id);
    for (const candidate of sorted(wiki.pages.filter(x => !unavailable.has(x.id)))) {
      els.parent.add(new Option('  '.repeat(Math.min(ancestors(candidate).length, 6)) + candidate.title, candidate.id));
    }
    els.parent.value = pageById(p.parentId) ? p.parentId : '';
  }
  function wordCount(content) {
    // Word segmentation handles scripts written without spaces (Chinese, Japanese, Thai).
    if (wordSegmenter) { let n = 0; for (const part of wordSegmenter.segment(content)) if (part.isWordLike) n++; return n; }
    return content.trim() ? content.trim().split(/\s+/u).length : 0;
  }
  function fillPageIcon(element, page) {
    element.replaceChildren();
    const icon = page.icon || 'icon:file';
    if (icon.startsWith('icon:') && iconLibrary.has(icon.slice(5))) {
      element.innerHTML = iconLibrary.svg(icon.slice(5)); // SVG from the bundled allowlist only.
    } else {
      element.textContent = icon.startsWith('icon:') ? '▤' : icon.slice(0, 12);
    }
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
  function renderPageStats() {
    const p = currentPage(); if (!p) return;
    const words = wordCount(p.content);
    els.modified.textContent = 'Edited ' + shortDate(p.updatedAt);
    els.count.textContent = words.toLocaleString() + (words === 1 ? ' word' : ' words');
    els.pageId.textContent = pathFor(p.id);
  }
  function renderAll() {
    els.name.textContent = wiki.name;
    document.title = wiki.name + ' — LocalWiki';
    setSaveStatus();
    renderTree();
    renderPage();
  }
  function selectPage(id) {
    commitTitle();
    if (!pageById(id)) return;
    currentId = id;
    renderTree(); renderPage(); backupDraft();
  }
  function createPage(parentId = null, desiredTitle = 'New page') {
    commitTitle();
    if (parentId && !pageById(parentId)) parentId = null;
    desiredTitle = desiredTitle.normalize('NFC');
    const existing = new Set(wiki.pages.map(p => titleKey(p.title)));
    let title = desiredTitle;
    for (let i = 2; existing.has(titleKey(title)); i++) title = desiredTitle + ' (' + i + ')';
    recordUndo(`creating "${title}"`);
    const page = {id: uniqueId(title), title, parentId, tags: [], content: '', icon: '', createdAt: isoNow(), updatedAt: isoNow()};
    wiki.pages.push(page);
    indexDirty = true;
    changedIds.add(page.id);
    currentId = page.id;
    els.search.value = '';
    markDirty(); renderAll();
    mode = 'edit'; setMode(mode);
    els.title.focus(); els.title.select();
    return page;
  }
  function deletePage() {
    commitTitle();
    const p = currentPage(); if (!p) return;
    const ids = descendantsOf(p.id);
    const message = ids.size === 1 ? `Delete "${p.title}"? You can restore it with Undo.` :
      `Delete "${p.title}" and its ${ids.size - 1} child page(s)? You can restore them with Undo.`;
    if (!confirm(message)) return;
    recordUndo(`deleting "${p.title}"` + (ids.size > 1 ? ` and ${ids.size - 1} child page(s)` : ''));
    for (const id of ids) changedIds.delete(id);
    wiki.pages = wiki.pages.filter(x => !ids.has(x.id));
    indexDirty = true;
    currentId = p.parentId && pageById(p.parentId) ? p.parentId : (wiki.pages[0]?.id || null);
    markDirty(); renderAll(); toast('Page deleted. Use Undo to restore it.');
  }

  // Renames are committed when the title field is left (or Enter is pressed), not per keystroke,
  // so intermediate titles never capture links. Committing rewrites links and moves the page ID.
  function rewriteLinks(content, isTarget, newTarget) {
    let inFence = false;
    return content.split('\n').map(line => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
      if (inFence) return line;
      // Odd-indexed parts are inline code spans, which never render as links.
      return line.split(/(`[^`\n]+`)/).map((part, i) => i % 2 ? part :
        part.replace(/\[\[([^\]\n]+)\]\]/g, (literal, descriptor) => {
          const sep = descriptor.indexOf('|');
          const target = (sep < 0 ? descriptor : descriptor.slice(0, sep)).trim();
          const replacement = isTarget(target);
          if (!replacement) return literal;
          return '[[' + newTarget(replacement) + (sep < 0 ? '' : descriptor.slice(sep)) + ']]';
        })).join('');
    }).join('\n');
  }
  function commitTitle() {
    if (!renameFrom) return;
    const {id: oldId, title: oldTitle} = renameFrom;
    renameFrom = null;
    const page = pageById(oldId);
    if (!page) return;
    const title = page.title.trim().normalize('NFC');
    const reject = message => {
      page.title = oldTitle; touchPage(page); dropNoopUndo(page); renderAfterRename(); toast(message);
    };
    if (!title) { reject('A page title cannot be empty.'); return; }
    const clash = pageWithTitle(title, oldId);
    if (clash) { reject(`Another page is already titled "${clash.title}".`); return; }
    page.title = title;
    if (title === oldTitle) { touchPage(page); dropNoopUndo(page); renderAfterRename(); return; }
    const newId = uniqueId(title, oldId);
    // Links resolve by ID first, then by case-insensitive title (see inlineMarkdown). A target that
    // is both this page's ID and its title (e.g. [[welcome]]) is rewritten as a title link.
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
      changedIds.delete(oldId);
      page.id = newId;
      if (currentId === oldId) currentId = newId;
      indexDirty = true;
    }
    touchPage(page);
    renderAfterRename();
    if (relinked) toast(`Renamed. Updated links in ${relinked} page(s).`);
  }
  // Like renderPage, but leaves the editor's caret alone unless the content itself changed.
  function renderAfterRename() {
    renderTree();
    const p = currentPage(); if (!p) return;
    els.title.value = p.title;
    if (els.content.value !== p.content) els.content.value = p.content;
    renderParentChoices(p); renderBreadcrumbs(p); renderPageStats(); renderMarkdown();
  }
  function inlineMarkdown(input) {
    const tokens = [];
    const protect = html => { const n = tokens.push(html) - 1; return '\uE000' + n + '\uE001'; };
    let s = String(input);
    s = s.replace(/`([^`\n]+)`/g, (_m, code) => protect('<code>' + escapeHtml(code) + '</code>'));
    s = s.replace(/:icon\[([a-z0-9-]+)\]:/g, (literal, name) => iconLibrary.has(name)
      ? protect('<span class="inline-wiki-icon" role="img" aria-label="' + escapeHtml(name) + '">' + iconLibrary.svg(name) + '</span>')
      : literal);
    s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_m, descriptor) => {
      const sep = descriptor.indexOf('|');
      const target = (sep < 0 ? descriptor : descriptor.slice(0, sep)).trim();
      const label = (sep < 0 ? target : descriptor.slice(sep + 1)).trim();
      const match = wiki.pages.find(p => p.id === target) || wiki.pages.find(p => titleKey(p.title) === titleKey(target));
      return protect('<a href="#" class="wiki-link' + (!match ? ' missing-link' : '') + '" data-wiki-target="' + escapeHtml(target) + '">' + escapeHtml(label || target) + '</a>');
    });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_m, label, url) =>
      protect('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>'));
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s.replace(/\uE000(\d+)\uE001/g, (_m, index) => tokens[Number(index)] || '');
  }
  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
  }
  function tableDivider(line) {
    const c = cells(line);
    return c.length > 0 && c.every(x => /^:?-{3,}:?$/.test(x));
  }
  function blockStart(lines, i) {
    const x = lines[i] || '';
    return /^\s*$/.test(x) || /^\s*```/.test(x) || /^#{1,6}\s+/.test(x) || /^\s*(?:[-*+] |\d+\. )/.test(x) || /^\s*>/.test(x) || /^\s*(?:---+|\*\*\*+)\s*$/.test(x) ||
      (x.includes('|') && i + 1 < lines.length && tableDivider(lines[i + 1]));
  }
  function markdownToHtml(source) {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*```/.test(line)) {
        i++;
        const code = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 4);
        out.push(`<h${level} dir="auto">${inlineMarkdown(heading[2])}</h${level}>`); i++; continue;
      }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (line.includes('|') && i + 1 < lines.length && tableDivider(lines[i + 1])) {
        const tableStartLine = i;
        const headers = cells(line); i += 2;
        let table = '<table><thead><tr>' + headers.map(c => '<th dir="auto">' + inlineMarkdown(c) + '</th>').join('') + '</tr></thead><tbody>';
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const values = cells(lines[i++]);
          table += '<tr>' + headers.map((_h, j) => '<td dir="auto">' + inlineMarkdown(values[j] || '') + '</td>').join('') + '</tr>';
        }
        out.push('<div class="table-block"><div class="table-block-actions"><button type="button" class="table-edit-btn" data-table-line="' + tableStartLine + '">✎ Edit table</button></div><div class="table-scroll">' + table + '</tbody></table></div></div>'); continue;
      }
      const listType = /^\s*[-*+] /.test(line) ? 'ul' : /^\s*\d+\. /.test(line) ? 'ol' : null;
      if (listType) {
        const items = [];
        const itemRE = listType === 'ul' ? /^\s*[-*+] (.*)$/ : /^\s*\d+\. (.*)$/;
        while (i < lines.length && itemRE.test(lines[i])) {
          const item = lines[i++].match(itemRE)[1];
          items.push('<li dir="auto">' + inlineMarkdown(item) + '</li>');
        }
        out.push('<' + listType + '>' + items.join('') + '</' + listType + '>'); continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote dir="auto">' + inlineMarkdown(quote.join(' ')) + '</blockquote>'); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && !blockStart(lines, i)) paragraph.push(lines[i++]);
      out.push('<p dir="auto">' + paragraph.map(inlineMarkdown).join('<br>') + '</p>');
    }
    return out.join('\n');
  }
  function renderMarkdown() {
    const page = currentPage();
    els.preview.innerHTML = page ? markdownToHtml(page.content) : '';
  }
  function setMode(next) {
    mode = next;
    els.card.classList.remove('mode-preview', 'mode-edit', 'mode-split');
    els.card.classList.add('mode-' + next);
    for (const btn of document.querySelectorAll('[data-mode]')) {
      btn.classList.toggle('active', btn.dataset.mode === next);
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === next));
    }
    els.toolbar.style.visibility = next === 'preview' ? 'hidden' : 'visible';
    persistUI();
  }
  function applyPageWidth(value) {
    pageWidth = ['75', '90', '100'].includes(String(value)) ? String(value) : '90';
    document.documentElement.style.setProperty('--page-width', pageWidth + '%');
    els.pageWidth.value = pageWidth;
  }
  function persistUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({mode, theme: document.documentElement.dataset.theme, pageWidth})); }
    catch (_) { /* Storage can be disabled for file URLs. */ }
  }
  function formatSelection(kind) {
    const p = currentPage(); if (!p) return;
    if (kind === 'table') { openTableBuilder(); return; }
    if (mode === 'preview') setMode('edit');
    const input = els.content;
    const start = input.selectionStart, end = input.selectionEnd;
    const selected = input.value.substring(start, end);
    let before = '', after = '', placeholder = 'text';
    switch (kind) {
      case 'heading': before = '## '; placeholder = 'Heading'; break;
      case 'bold': before = '**'; after = '**'; break;
      case 'italic': before = '*'; after = '*'; break;
      case 'list': before = '- '; placeholder = 'List item'; break;
      case 'link': before = '['; after = '](https://example.com)'; placeholder = 'Link text'; break;
      case 'wiki': before = '[['; after = ']]'; placeholder = 'Page title'; break;
      case 'code': before = '`'; after = '`'; break;
      default: return;
    }
    const insertion = before + (selected || placeholder) + after;
    recordUndo('formatting');
    input.setRangeText(insertion, start, end, 'end');
    p.content = input.value;
    touchPage(p); renderMarkdown(); renderTree(); renderPageStats();
    input.focus();
    if (!selected && placeholder) input.setSelectionRange(start + before.length, start + before.length + placeholder.length);
  }

  // Rich insertion helpers. The stored page content is always plain Markdown.
  function insertAtCaret(text, caret = els.content.selectionStart) {
    const page = currentPage(); if (!page) return;
    if (mode === 'preview') setMode('edit');
    const textarea = els.content;
    caret = Math.max(0, Math.min(caret, textarea.value.length));
    recordUndo('inserting text');
    textarea.setRangeText(text, caret, caret, 'end');
    page.content = textarea.value;
    touchPage(page); renderMarkdown(); renderPageStats();
    if (els.search.value) renderTree();
    textarea.focus();
  }
  function pickerEntries() {
    if (pickerTab === 'icons') return iconLibrary.items.map(item => ({name:item.name, label:item.label, glyph:'icon:' + item.name}));
    return (pickerTab === 'symbols' ? PICKER_SYMBOLS : PICKER_EMOJI).map(([glyph,label]) => ({name: glyph, label, glyph}));
  }
  function renderPicker() {
    for (const tab of document.querySelectorAll('[data-picker-tab]')) {
      tab.classList.toggle('active', tab.dataset.pickerTab === pickerTab);
      tab.setAttribute('aria-pressed', String(tab.dataset.pickerTab === pickerTab));
    }
    const query = searchFold(els.pickerSearch.value.trim());
    const entries = pickerEntries().filter(item => searchFold(item.label).includes(query) || searchFold(item.name).includes(query));
    els.pickerResults.replaceChildren();
    if (!entries.length) {
      const message = document.createElement('div'); message.className = 'picker-empty'; message.textContent = 'No matching items.';
      els.pickerResults.append(message);
    }
    for (const item of entries) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'picker-item'; button.title = item.label;
      const glyph = document.createElement('span'); glyph.className = 'picker-glyph';
      if (item.glyph.startsWith('icon:')) glyph.innerHTML = iconLibrary.svg(item.glyph.slice(5));
      else glyph.textContent = item.glyph;
      const label = document.createElement('span'); label.className = 'picker-label'; label.textContent = item.label;
      button.append(glyph,label);
      button.addEventListener('click', () => {
        if (pickerTarget === 'page') {
          const page = currentPage(); if (!page) return;
          recordUndo('changing the page icon');
          page.icon = item.glyph;
          touchPage(page);
          fillPageIcon(els.pageIconDisplay, page);
          renderTree();
        } else {
          const text = item.glyph.startsWith('icon:') ? ':icon[' + item.glyph.slice(5) + ']:' : item.glyph;
          insertAtCaret(text, pickerCaret);
        }
        els.pickerDialog.close();
      });
      els.pickerResults.append(button);
    }
    els.pickerClear.hidden = pickerTarget !== 'page';
    els.pickerHint.textContent = pickerTarget === 'page' ? 'Choose an icon for this page.' : 'Choose a symbol or icon to insert at the cursor.';
  }
  function openPicker(target = 'body', tab = 'icons') {
    if (!currentPage()) return;
    pickerTarget = target; pickerTab = tab;
    pickerCaret = els.content.selectionStart || 0;
    els.pickerSearch.value = '';
    renderPicker();
    els.pickerDialog.showModal();
    els.pickerSearch.focus();
  }
  function findTableAtLine(lineIndex) {
    const lines = els.content.value.replace(/\r\n?/g,'\n').split('\n');
    for (let i = 0; i + 1 < lines.length; i++) {
      if (!lines[i].includes('|') || !tableDivider(lines[i + 1])) continue;
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes('|')) j++;
      if (lineIndex >= i && lineIndex < j) {
        const columns = cells(lines[i]).length;
        const values = [cells(lines[i])];
        for (let k = i+2; k < j; k++) values.push(cells(lines[k]));
        return {startLine:i, endLine:j, values:values.map(row => Array.from({length:columns}, (_, col) => row[col] || ''))};
      }
      i = j-1;
    }
    return null;
  }
  function lineOffset(lines, n) {
    let position = 0;
    for (let i=0; i<n; i++) position += lines[i].length + 1;
    return position;
  }
  function renderTableGrid() {
    if (!tableDraft) return;
    const rows = tableDraft.values.length, cols = tableDraft.values[0].length;
    els.tableGrid.replaceChildren();
    els.tableGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(132px, 1fr))`;
    tableDraft.values.forEach((row, r) => row.forEach((value,c) => {
      const input = document.createElement('input'); input.type = 'text'; input.className = 'table-cell-input' + (r === 0 ? ' is-header':'');
      input.value = value;
      input.placeholder = r === 0 ? 'Column ' + (c+1) : 'Row ' + r + ', column ' + (c+1);
      input.setAttribute('aria-label', (r === 0 ? 'Header ' : 'Row ' + r + ', ') + 'column ' + (c+1));
      input.addEventListener('input', () => {tableDraft.values[r][c] = input.value;});
      els.tableGrid.append(input);
    }));
    els.tableSize.textContent = cols + ' column' + (cols===1?'':'s') + ' × ' + (rows-1) + ' data row' + (rows===2?'':'s');
    els.tableRemoveRow.disabled = rows <= 2;
    els.tableRemoveCol.disabled = cols <= 1;
    els.tableAddRow.disabled = rows >= 41;
    els.tableAddCol.disabled = cols >= 12;
  }
  function openTableBuilder(lineIndex = null) {
    if (!currentPage()) return;
    const caret = els.content.selectionStart || 0;
    const caretLine = els.content.value.slice(0,caret).split('\n').length-1;
    const located = findTableAtLine(lineIndex === null ? caretLine : lineIndex);
    tableDraft = located ? {...located, caret} : {
      startLine:null, endLine:null, caret,
      values:[['Column 1','Column 2','Column 3'],['','',''],['','','']]
    };
    els.tableTitle.textContent = located ? 'Edit table' : 'Insert table';
    els.tableConfirm.textContent = located ? 'Update table' : 'Insert table';
    renderTableGrid(); els.tableDialog.showModal();
    els.tableGrid.querySelector('input')?.focus();
  }
  function tableMarkdown(values) {
    const encode = value => String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
    const row = cells => '| ' + cells.map(encode).join(' | ') + ' |';
    return [row(values[0]), row(values[0].map(() => '---')), ...values.slice(1).map(row)].join('\n');
  }
  function commitTable() {
    if (!tableDraft || !currentPage()) return;
    const md = tableMarkdown(tableDraft.values);
    const old = els.content.value;
    if (mode === 'preview') setMode('edit');
    if (tableDraft.startLine !== null) {
      recordUndo('editing a table');
      const lines = old.split('\n');
      const start = lineOffset(lines,tableDraft.startLine);
      // A table can end at EOF; ensure we do not include unrelated text in the replacement.
      const end = tableDraft.endLine >= lines.length ? old.length : lineOffset(lines,tableDraft.endLine);
      const replacement = md + (end < old.length || old.slice(start,end).endsWith('\n') ? '\n' : '');
      els.content.setRangeText(replacement,start,end,'end');
      const page = currentPage(); page.content = els.content.value;
      touchPage(page); renderMarkdown(); renderPageStats(); if (els.search.value) renderTree();
      els.content.focus();
    } else {
      const caret = tableDraft.caret;
      const prefix = caret && old[caret-1] !== '\n' ? '\n\n' : '';
      const suffix = caret < old.length && old[caret] !== '\n' ? '\n\n' : '\n';
      insertAtCaret(prefix+md+suffix, caret);
    }
    tableDraft = null;
    els.tableDialog.close();
  }

  // Storage format: wiki.json is a tiny manifest; each page has its own JSON file.
  // IDs remain stable as pages are renamed or moved. A stored pathname never changes.
  // forCopy: the index for a new location, which only lists set-aside files we can copy there.
  function indexObject(forCopy = false) {
    const entries = [...wiki.pages, ...setAside.filter(entry => !forCopy || entry.text !== null)];
    return {
      schemaVersion: SCHEMA_VERSION, type: 'localwiki-index', name: wiki.name,
      updatedAt: wiki.updatedAt || isoNow(),
      pages: entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(p => ({id: p.id, file: pathFor(p.id)}))
    };
  }
  function jsonText(value) { return JSON.stringify(value, null, 2) + '\n'; }
  function filesForExport() {
    const files = [['wiki.json', jsonText(indexObject(true))]];
    for (const p of wiki.pages) files.push([pathFor(p.id), jsonText(p)]);
    for (const entry of setAside) if (entry.text !== null) files.push([entry.file, entry.text]);
    return files;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  // Minimal ZIP writer (standard STORE entries, UTF-8 filenames, no online library).
  function makeZip(files) {
    const encoder = new TextEncoder();
    const parts = [], central = [];
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : c >>> 1; table[n] = c >>> 0; }
    const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const header = (size, fill) => { const bytes = new Uint8Array(size); fill(new DataView(bytes.buffer)); return bytes; };
    let offset = 0;
    for (const [name, data] of files) {
      const path = encoder.encode(name), content = encoder.encode(data), crc = crc32(content);
      if (path.length > 65535 || content.length > 0xFFFFFFFF) throw new Error('A wiki file is too large to export.');
      const local = header(30, v => {
        v.setUint32(0, 0x04034B50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
        v.setUint32(14, crc, true); v.setUint32(18, content.length, true); v.setUint32(22, content.length, true);
        v.setUint16(26, path.length, true);
      });
      parts.push(local, path, content);
      const currentOffset = offset;
      offset += local.length + path.length + content.length;
      const entry = header(46, v => {
        v.setUint32(0, 0x02014B50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
        v.setUint16(8, 0x0800, true); v.setUint32(16, crc, true);
        v.setUint32(20, content.length, true); v.setUint32(24, content.length, true);
        v.setUint16(28, path.length, true); v.setUint32(42, currentOffset, true);
      });
      central.push(entry, path);
    }
    const centralLength = central.reduce((sum, part) => sum + part.length, 0);
    if (files.length > 65535 || offset + centralLength > 0xFFFFFFFF) throw new Error('Wiki ZIP exceeds standard ZIP limits.');
    const end = header(22, v => {
      v.setUint32(0, 0x06054B50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true);
      v.setUint32(12, centralLength, true); v.setUint32(16, offset, true);
    });
    return new Blob([...parts, ...central, end], {type:'application/zip'});
  }
  function exportZip() {
    commitTitle();
    try {
      const name = slug(wiki.name, 'my-wiki') + '.zip';
      downloadBlob(makeZip(filesForExport()), name);
      toast('Exported ' + name + '. It contains wiki.json and every page JSON.');
    } catch (err) { console.error(err); toast('ZIP export failed: ' + err.message); }
  }
  async function readJsonFile(handle) { return JSON.parse(await (await handle.getFile()).text()); }
  async function writeJsonFile(handle, text) {
    const writer = await handle.createWritable();
    try { await writer.write(text); await writer.close(); }
    catch (err) { try { await writer.abort(); } catch (_) {} throw err; }
  }
  // Opening is tolerant: only an unusable wiki.json stops it. Every page problem is collected,
  // and the rest of the wiki loads.
  async function readFolderContents(getText) {
    let index;
    try { index = JSON.parse(await getText('wiki.json')); }
    catch (err) {
      if (err.name === 'NotFoundError') throw new Error('This folder has no wiki.json.');
      throw new Error(err instanceof SyntaxError ? 'wiki.json is not valid JSON (' + err.message + ').' : 'Could not read wiki.json: ' + err.message);
    }
    if (!index || index.type !== 'localwiki-index' || !Array.isArray(index.pages)) throw new Error('wiki.json is not a LocalWiki index.');
    if (index.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported wiki.json version: ' + index.schemaVersion);
    if (index.pages.length > 20000) throw new Error('Too many wiki pages (limit 20,000).');
    const result = {name: 'Untitled Wiki', pages: [], setAside: [], problems: [], repairedIds: new Set(), indexNeedsRewrite: false};
    const problem = (file, message, kind) => result.problems.push({file, message, kind});
    if (typeof index.name === 'string' && index.name.trim()) result.name = index.name.trim().slice(0, 140);
    else problem('wiki.json', 'The wiki has no name, so "Untitled Wiki" is used.', 'info');
    const ids = new Set();
    for (const entry of index.pages) {
      const file = typeof entry?.file === 'string' ? entry.file : 'wiki.json';
      if (!entry || typeof entry.id !== 'string' || typeof entry.file !== 'string' || !PAGE_PATH.test(entry.file) || entry.file !== pathFor(entry.id)) {
        problem(file, 'Invalid entry in wiki.json (' + JSON.stringify(entry) + '). It was ignored and will be removed from wiki.json on the next save; no file is deleted.', 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      if (ids.has(entry.id)) {
        problem(file, 'Listed more than once in wiki.json. The duplicate entry was ignored.', 'ignored');
        result.indexNeedsRewrite = true; continue;
      }
      ids.add(entry.id);
      let text;
      try { text = await getText(entry.file); }
      catch (err) {
        if (err.name === 'NotFoundError') {
          problem(file, 'The file is missing. It will be removed from wiki.json on the next save.', 'missing');
          result.indexNeedsRewrite = true;
        } else {
          result.setAside.push({id: entry.id, file, text: null});
          problem(file, 'The file could not be read (' + err.message + '). It was set aside and left untouched.', 'set-aside');
        }
        continue;
      }
      try {
        const {page, notes} = normalizePage(JSON.parse(text), entry.id);
        if (notes.length) {
          result.repairedIds.add(page.id);
          problem(file, 'Repaired: ' + notes.join('; ') + '. The fix will be written on the next save.', 'repaired');
        }
        result.pages.push(page);
      } catch (err) {
        result.setAside.push({id: entry.id, file, text});
        const reason = err instanceof SyntaxError ? 'is not valid JSON (' + err.message + ')' : err.message;
        problem(file, `The file ${reason}. It was set aside and left untouched; fix it in a text editor and open the folder again.`, 'set-aside');
      }
    }
    repairStructure(result.pages, (page, message, repaired) => {
      if (repaired) result.repairedIds.add(page.id);
      problem(pathFor(page.id), 'This page ' + message + (repaired ? '. The fix will be written on the next save.' : '.'), repaired ? 'repaired' : 'info');
    });
    return result;
  }
  function acceptLoadedFolder(result, name, handle) {
    wiki = {name: result.name, pages: result.pages};
    currentId = wiki.pages[0]?.id || null;
    // Only files that loaded may ever be deleted as stale; set-aside files are never touched.
    diskPaths = new Set(result.pages.map(p => pathFor(p.id)));
    setAside = result.setAside; loadProblems = result.problems; copySetAside = false;
    changedIds = new Set(result.repairedIds); renameFrom = null;
    indexDirty = result.indexNeedsRewrite;
    folderHandle = handle;
    folderName = name;
    dirty = changedIds.size > 0;
    els.search.value = '';
    clearHistory(); clearTimeout(autosaveTimer); lastSavedAt = null; dirtySince = 0;
    renderAll(); renderProblems(); backupDraft();
    const count = loadProblems.length;
    toast('Opened ' + folderName + ': ' + wiki.pages.length + ' page(s)' + (count ? `, ${count} problem(s) found.` : '.'));
    if (count) showProblems();
  }
  function renderProblems() {
    els.problemsButton.hidden = !loadProblems.length;
    els.problemsButton.textContent = '⚠ \u00a0 ' + loadProblems.length + ' load problem' + (loadProblems.length === 1 ? '' : 's');
    els.problemsList.replaceChildren(...loadProblems.map(({file, message}) => {
      const item = document.createElement('li');
      const name = document.createElement('code'); name.textContent = file;
      item.append(name, ' ', message);
      return item;
    }));
  }
  function showProblems() { renderProblems(); if (loadProblems.length) els.problemsDialog.showModal(); }
  async function loadFromFolderHandle(handle) {
    const getText = async name => {
      const parts = name.split('/');
      if (parts.length === 1) return (await (await handle.getFileHandle(parts[0])).getFile()).text();
      const pages = await handle.getDirectoryHandle('pages');
      return (await (await pages.getFileHandle(parts[1])).getFile()).text();
    };
    return readFolderContents(getText);
  }
  function isCancellation(err) { return err?.name === 'AbortError'; }
  async function openFolder() {
    if (dirty && !confirm('Open a different folder? Your unsaved edits will be replaced.')) return;
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
        const result = await loadFromFolderHandle(handle);
        acceptLoadedFolder(result, handle.name, handle);
        return;
      } catch (err) {
        if (isCancellation(err)) return;
        if (!['SecurityError','NotAllowedError','TypeError','NotSupportedError'].includes(err.name)) {
          console.error(err); toast('Could not open folder: ' + err.message); return;
        }
        console.warn('Folder access unavailable; switching to folder import', err);
      }
    }
    els.folderInput.click();
  }
  async function acceptFolderFiles(files) {
    const fileMap = new Map();
    let name = 'Imported folder';
    for (const file of files) {
      const relative = file.webkitRelativePath || file.name;
      const parts = relative.split('/');
      if (parts.length > 1) { name = parts[0]; parts.shift(); }
      const path = parts.join('/').normalize('NFC');
      if (fileMap.has(path)) throw new Error('Duplicate file path: ' + path);
      fileMap.set(path, file);
    }
    const result = await readFolderContents(async path => {
      const file = fileMap.get(path.normalize('NFC'));
      if (!file) throw new DOMException('Missing ' + path, 'NotFoundError');
      return file.text();
    });
    acceptLoadedFolder(result, name, null);
    if (!result.problems.length) toast('Folder loaded read-only. Use Save to folder or Export ZIP to keep edits.');
  }
  async function saveToFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      toast('Direct folder saving is unavailable here. Export a ZIP instead.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({mode:'readwrite', id:'localwiki'});
      let existing = null;
      try { existing = await readJsonFile(await handle.getFileHandle('wiki.json')); }
      catch (err) { if (err.name !== 'NotFoundError') throw err; }
      if (existing) {
        const sameIndex = existing.type === 'localwiki-index' &&
          JSON.stringify(existing.pages) === JSON.stringify(indexObject().pages) && existing.name === wiki.name;
        if (!sameIndex && !confirm(`Folder "${handle.name}" already has a wiki.json. Overwrite its index with this wiki? Other page files are not deleted.`)) return;
      }
      // When changing destination, copy all pages, not just previously edited pages.
      folderHandle = handle; folderName = handle.name;
      changedIds = new Set(wiki.pages.map(p => p.id));
      diskPaths = new Set(); indexDirty = true; // never delete files we did not write here
      copySetAside = setAside.length > 0;
      markDirty();
      await saveChanges();
    } catch (err) {
      if (isCancellation(err)) return;
      console.error(err); toast('Could not choose save folder: ' + err.message);
    }
  }
  async function saveChanges({auto = false} = {}) {
    if (saving) return;
    commitTitle();
    clearTimeout(autosaveTimer);
    if (!folderHandle) {
      if (auto) return;
      if (typeof window.showDirectoryPicker === 'function') { await saveToFolder(); return; }
      toast('Choose Export wiki ZIP (direct folder saving is unavailable in this browser).'); return;
    }
    const keep = new Set([...wiki.pages, ...setAside].map(p => pathFor(p.id)));
    const stale = [...diskPaths].filter(path => !keep.has(path));
    if (!dirty && !indexDirty && !changedIds.size && !stale.length && !copySetAside) { if (!auto) toast('No changes to save.'); return; }
    saving = true; setSaveStatus();
    // Snapshot everything up front so edits made during the async writes cannot mix states.
    const version = changeVersion;
    const pending = wiki.pages.filter(p => changedIds.has(p.id)).map(p => [pathFor(p.id), jsonText(p)]);
    const copying = copySetAside ? setAside.filter(entry => entry.text !== null) : [];
    const indexText = indexDirty ? jsonText(indexObject(copySetAside)) : null;
    try {
      const pagesDir = await folderHandle.getDirectoryHandle('pages', {create:true});
      for (const [path, text] of pending) {
        await writeJsonFile(await pagesDir.getFileHandle(path.split('/')[1], {create:true}), text);
        diskPaths.add(path);
      }
      // Set-aside files are copied byte for byte, and are not added to diskPaths (never deleted).
      for (const entry of copying) await writeJsonFile(await pagesDir.getFileHandle(entry.file.split('/')[1], {create:true}), entry.text);
      // The manifest is written after every page it references exists, and before stale files go.
      if (indexText) await writeJsonFile(await folderHandle.getFileHandle('wiki.json', {create:true}), indexText);
      for (const path of stale) {
        try { await pagesDir.removeEntry(path.split('/')[1]); }
        catch (err) { if (err.name !== 'NotFoundError') throw err; }
        diskPaths.delete(path);
      }
      if (copySetAside) { setAside = setAside.filter(entry => entry.text !== null); copySetAside = false; }
      // Repairs and index clean-ups are now on disk; only set-aside and informational notes still apply.
      loadProblems = loadProblems.filter(item => item.kind === 'set-aside' || item.kind === 'info');
      renderProblems();
      lastSavedAt = new Date();
      if (version === changeVersion) {
        changedIds.clear(); indexDirty = false; dirty = false; dirtySince = 0;
        backupDraft();
        if (!auto) toast('Saved ' + pending.length + ' page file(s)' + (indexText ? ' and wiki.json' : '') + ' to ' + folderName + '.');
      }
      // Otherwise edits arrived during the save; they are still marked and autosave picks them up.
    } catch (err) {
      console.error(err);
      toast((auto ? 'Autosave failed: ' : 'Save failed: ') + err.message);
    } finally {
      saving = false; setSaveStatus();
      if (dirty) scheduleAutosave();
    }
  }
  function newWiki() {
    if (dirty && !confirm('Create a new wiki? Your unsaved edits will be replaced.')) return;
    const name = prompt('Name your new wiki:', 'My Wiki');
    if (name === null) return;
    wiki = normalizeWiki({name: name.trim() || 'My Wiki', pages: []});
    currentId = null; folderHandle = null; folderName = 'No folder selected'; dirty = false;
    diskPaths.clear(); changedIds.clear(); renameFrom = null; indexDirty = true; changeVersion++;
    setAside = []; loadProblems = []; copySetAside = false; renderProblems();
    clearHistory(); clearTimeout(autosaveTimer); lastSavedAt = null; dirtySince = 0;
    els.search.value = '';
    renderAll(); backupDraft(); toast('New wiki created. Use + to add a page.');
  }
  function handleWikiLink(event) {
    const a = event.target.closest('a.wiki-link');
    if (!a) return;
    event.preventDefault();
    const target = a.dataset.wikiTarget;
    const match = pageById(target) || wiki.pages.find(p => titleKey(p.title) === titleKey(target));
    if (match) selectPage(match.id);
    else if (confirm(`Page "${target}" does not exist. Create it?`)) createPage(null, target.slice(0, 140));
  }
  function installEvents() {
    els.newPage.addEventListener('click', () => createPage());
    els.emptyCreate.addEventListener('click', () => createPage());
    els.newChild.addEventListener('click', () => createPage(currentId));
    els.del.addEventListener('click', deletePage);
    els.search.addEventListener('input', renderTree);
    els.title.addEventListener('input', () => {
      const p = currentPage(); if (!p) return;
      // The whole title edit, including the rename it commits, is one undo step.
      if (!renameFrom) { recordUndo(`renaming "${p.title}"`); renameFrom = {id: p.id, title: p.title}; }
      p.title = els.title.value; touchPage(p);
      renderTree(); renderBreadcrumbs(p); els.name.textContent = wiki.name;
    });
    els.title.addEventListener('change', commitTitle);
    els.title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitTitle(); } });
    els.tags.addEventListener('input', () => {
      const p = currentPage(); if (!p) return;
      recordUndo('tag edits', 'tags:' + p.id);
      p.tags = [...new Set(els.tags.value.split(',').map(s => s.trim()).filter(Boolean))];
      touchPage(p); if (els.search.value) renderTree();
    });
    els.parent.addEventListener('change', () => {
      const p = currentPage(); if (!p) return;
      const next = els.parent.value || null;
      if (next && descendantsOf(p.id).has(next)) { toast('Cannot move a page inside itself.'); renderParentChoices(p); return; }
      recordUndo(`moving "${p.title}"`);
      p.parentId = next; touchPage(p);
      renderTree(); renderBreadcrumbs(p); renderParentChoices(p);
    });
    els.content.addEventListener('input', () => {
      const p = currentPage(); if (!p) return;
      recordUndo('typing', 'content:' + p.id);
      p.content = els.content.value; touchPage(p);
      renderPageStats(); renderMarkdown();
      if (els.search.value) renderTree();
    });
    els.preview.addEventListener('click', event => {
      const button = event.target.closest('button[data-table-line]');
      if (button) { openTableBuilder(Number(button.dataset.tableLine)); return; }
      handleWikiLink(event);
    });
    for (const btn of document.querySelectorAll('[data-mode]')) btn.addEventListener('click', () => setMode(btn.dataset.mode));
    for (const btn of document.querySelectorAll('[data-format]')) btn.addEventListener('click', () => formatSelection(btn.dataset.format));
    $('symbols-btn').addEventListener('click', () => openPicker('body','symbols'));
    $('icons-btn').addEventListener('click', () => openPicker('body','icons'));
    els.pageIconButton.addEventListener('click', () => openPicker('page','icons'));
    for (const tab of document.querySelectorAll('[data-picker-tab]')) tab.addEventListener('click', () => {
      pickerTab = tab.dataset.pickerTab; renderPicker();
    });
    els.pickerSearch.addEventListener('input', renderPicker);
    $('picker-close').addEventListener('click', () => els.pickerDialog.close());
    $('picker-cancel').addEventListener('click', () => els.pickerDialog.close());
    els.pickerClear.addEventListener('click', () => {
      const page = currentPage(); if (!page) return;
      recordUndo('removing the page icon');
      page.icon = ''; touchPage(page); fillPageIcon(els.pageIconDisplay,page); renderTree();
      els.pickerDialog.close();
    });
    els.problemsButton.addEventListener('click', showProblems);
    els.undo.addEventListener('click', undo);
    els.redo.addEventListener('click', redo);
    // Save right away when the user switches tabs or minimizes; the page may be closed next.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave(); });
    $('problems-close').addEventListener('click', () => els.problemsDialog.close());
    $('problems-ok').addEventListener('click', () => els.problemsDialog.close());
    $('table-close').addEventListener('click', () => els.tableDialog.close());
    $('table-cancel').addEventListener('click', () => els.tableDialog.close());
    els.tableConfirm.addEventListener('click', commitTable);
    els.tableAddRow.addEventListener('click', () => {
      if (tableDraft.values.length >= 41) return;
      tableDraft.values.push(tableDraft.values[0].map(() => '')); renderTableGrid();
    });
    els.tableRemoveRow.addEventListener('click', () => {
      if (tableDraft.values.length <= 2) return;
      tableDraft.values.pop(); renderTableGrid();
    });
    els.tableAddCol.addEventListener('click', () => {
      if (tableDraft.values[0].length >= 12) return;
      tableDraft.values.forEach((row,idx) => row.push(idx === 0 ? 'Column ' + (row.length+1):''));
      renderTableGrid();
    });
    els.tableRemoveCol.addEventListener('click', () => {
      if (tableDraft.values[0].length <= 1) return;
      tableDraft.values.forEach(row => row.pop()); renderTableGrid();
    });
    els.open.addEventListener('click', openFolder);
    els.save.addEventListener('click', saveChanges);
    els.saveAs.addEventListener('click', saveToFolder);
    els.exportZip.addEventListener('click', exportZip);
    els.newWiki.addEventListener('click', newWiki);
    els.rename.addEventListener('click', () => {
      const name = prompt('Wiki name:', wiki.name);
      if (name === null || !name.trim() || wiki.name === name.trim()) return;
      recordUndo('renaming the wiki');
      wiki.name = name.trim().slice(0, 140);
      indexDirty = true; markDirty(); renderAll();
    });
    els.folderInput.addEventListener('change', async () => {
      if (els.folderInput.files?.length) {
        try { await acceptFolderFiles([...els.folderInput.files]); }
        catch (err) { console.error(err); toast('Could not import folder: ' + err.message); }
      }
      els.folderInput.value = '';
    });
    els.pageWidth.addEventListener('change', () => {
      applyPageWidth(els.pageWidth.value);
      persistUI();
    });
    els.theme.addEventListener('click', () => {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      persistUI();
    });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  function init() {
    wiki = normalizeWiki({name:'My Wiki', pages:[]});
    currentId = null;
    let recoveredUnsaved = false;
    try {
      const recovered = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (recovered?.wiki) {
        wiki = normalizeWiki(recovered.wiki);
        currentId = pageByIdIn(wiki, recovered.currentId)?.id || wiki.pages[0]?.id || null;
        if (recovered.renameFrom && pageByIdIn(wiki, recovered.renameFrom.id)) renameFrom = recovered.renameFrom;
        setAside = (Array.isArray(recovered.setAside) ? recovered.setAside : []).filter(entry =>
          typeof entry?.id === 'string' && entry.file === pathFor(entry.id) && PAGE_PATH.test(entry.file) &&
          (typeof entry.text === 'string' || entry.text === null) && !pageByIdIn(wiki, entry.id));
        // Directory permissions are not retained across reloads. This is a browser copy only.
        folderName = recovered.folderName || 'Recovered browser draft';
        dirty = recovered.dirty === true;
        changedIds = new Set(dirty ? wiki.pages.map(p => p.id) : []);
        indexDirty = dirty;
        recoveredUnsaved = dirty && wiki.pages.length > 0;
      }
    } catch (err) { console.warn('Draft recovery skipped:', err); }
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (ui?.theme === 'dark') document.documentElement.dataset.theme = 'dark';
      if (['edit', 'preview', 'split'].includes(ui?.mode)) mode = ui.mode;
      applyPageWidth(ui?.pageWidth);
    } catch (_) {}
    applyPageWidth(pageWidth);
    installEvents(); setMode(mode); commitTitle(); renderAll(); renderUndoButtons(); backupDraft();
    if (recoveredUnsaved) toast('Recovered unsaved changes from this browser. Save changes to write them to a folder.');
  }
  function pageByIdIn(model, id) { return model.pages.find(p => p.id === id); }
  init();
})();
