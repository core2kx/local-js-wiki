/* LocalWiki — history.js
   Session undo/redo. Each step is a snapshot of the whole wiki taken just before a change
   (pages stored as JSON strings; unchanged pages share one string, so steps are cheap).

   Usage: call record(action) BEFORE changing anything. action is a translatable description:
   a key such as 'act.typing', or {key: 'act.rename', params: {title}} (see the act.* texts in
   languages/en.json). Bursts of typing pass a second argument, a group name (e.g.
   "content:<page id>"), so quick successive edits share one step. A rename is one step: the
   snapshot is taken when the title edit starts, before the rename rewrites links (see pages.js).

   Restoring a step marks every page that differs as changed, so autosave writes the files back
   (an undone delete re-creates its file; an undone rename moves it back). A step that renamed
   pages remembers it (attachRename), so undo and redo also move the saved revisions.

   Depends on: i18n.js, state.js, revisions.js; asks LocalWiki.ui to redraw.
   Provides:   LocalWiki.history */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const state = LW.state;
  const {pageById, markDirty, serializePage, rememberPageText, forgetPageText} = LW.store;
  const ui = (LW.ui ||= {});
  const UNDO_LIMIT = 200, UNDO_PAUSE = 1000, UNDO_MAX_GROUP = 10000;

  let undoStack = [], redoStack = [];
  let undoGroup = null;      // {key, started, last} for coalescing bursts of typing

  function snapshot(label) { // label: {key, params}
    return {label, name: state.wiki.name, appearance: JSON.stringify(state.wiki.appearance), logo: state.logo,
      currentId: state.currentId, pages: state.wiki.pages.map(serializePage)};
  }
  function sameState(a, b) {
    return a.name === b.name && a.appearance === b.appearance && a.logo === b.logo &&
      a.pages.length === b.pages.length && a.pages.every((text, i) => text === b.pages[i]);
  }

  // Call before changing anything. Changes with the same key in quick succession (typing) share one step.
  function record(action, key = null) {
    const label = typeof action === 'string' ? {key: action, params: {}} : action;
    const now = Date.now();
    const g = undoGroup;
    if (key && g && g.key === key && now - g.last < UNDO_PAUSE && now - g.started < UNDO_MAX_GROUP) { g.last = now; return; }
    const entry = snapshot(label);
    // Nothing changed since the last step (e.g. right after a toolbar action): no new step, and no
    // group either, so the next typing starts its own step instead of joining that action.
    if (undoStack.length && sameState(undoStack[undoStack.length - 1], entry)) { undoGroup = null; return; }
    undoGroup = key ? {key, started: now, last: now} : null;
    undoStack.push(entry);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    ui.renderUndoButtons();
  }

  function restore(entry) {
    const wiki = state.wiki;
    const before = new Map(wiki.pages.map(page => [page.id, serializePage(page)]));
    const pages = entry.pages.map(text => { const page = JSON.parse(text); rememberPageText(page, text); return page; });
    const ids = new Set(pages.map(page => page.id));
    if (wiki.name !== entry.name || JSON.stringify(wiki.appearance) !== entry.appearance ||
        before.size !== ids.size || [...ids].some(id => !before.has(id))) state.indexDirty = true;
    if (state.logo !== entry.logo) state.logoDirty = true;
    wiki.name = entry.name;
    wiki.appearance = JSON.parse(entry.appearance);
    state.logo = entry.logo;
    wiki.pages = pages;
    // Rewrite every page that differs from what was there; undone deletions are written back too.
    for (const page of pages) if (before.get(page.id) !== serializePage(page)) state.changedIds.add(page.id);
    state.currentId = pageById(entry.currentId) ? entry.currentId : (pageById(state.currentId) ? state.currentId : pages[0]?.id || null);
    state.renameFrom = null; undoGroup = null;
    markDirty();
    ui.renderAll();
  }
  // Callers commit any pending title edit first (pages.commitTitle) so it becomes its own step.
  function step(from, to, verb) {
    const entry = from.pop();
    if (!entry) return;
    const counterpart = snapshot(entry.label);
    if (entry.renames) counterpart.renames = entry.renames;
    to.push(counterpart);
    const oldContent = pageById(state.currentId)?.content;
    restore(entry);
    // Undo reverses the step's renames (newest first); redo repeats them.
    const renames = verb === 'undo' ? [...(entry.renames || [])].reverse().map(([a, b]) => [b, a]) : entry.renames || [];
    for (const [fromId, toId] of renames) LW.revisions.noteRename(fromId, toId);
    ui.moveCaretToChange(oldContent);
    ui.renderUndoButtons();
    ui.toast(LW.i18n.t(verb === 'undo' ? 'toast.undid' : 'toast.redid', {action: entry.label}));
  }
  function undo() { step(undoStack, redoStack, 'undo'); }
  function redo() { step(redoStack, undoStack, 'redo'); }

  // A title edit that ended up changing nothing (rejected, or retyped as before) should not linger as
  // a no-op undo step. Typing touched the page's updatedAt, so restore that from the step first.
  function dropNoop(page) {
    const top = undoStack[undoStack.length - 1];
    const i = state.wiki.pages.indexOf(page);
    if (!top || top.pages.length !== state.wiki.pages.length || i < 0) return;
    const previous = JSON.parse(top.pages[i]);
    if (previous.id !== page.id) return;
    page.updatedAt = previous.updatedAt; forgetPageText(page);
    if (sameState(top, snapshot(top.label))) { undoStack.pop(); ui.renderUndoButtons(); }
  }
  // Records that the newest step renamed a page (pages.commitTitle calls this).
  function attachRename(fromId, toId) {
    const top = undoStack[undoStack.length - 1];
    if (top) (top.renames ||= []).push([fromId, toId]);
  }
  function clear() { undoStack = []; redoStack = []; undoGroup = null; ui.renderUndoButtons(); }
  // The steps Undo and Redo would apply next, as {key, params} (null when there is none).
  // The screen turns them into text, so they follow the language.
  function peek() {
    return {undo: undoStack[undoStack.length - 1]?.label ?? null, redo: redoStack[redoStack.length - 1]?.label ?? null};
  }

  LW.history = {record, undo, redo, dropNoop, attachRename, clear, peek};
})();
