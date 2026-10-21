/* LocalWiki — revisions.js
   Saved page history: earlier versions of each page, kept in the wiki folder so they survive
   reloads. One file per page:

     revisions/<page id>.json   {type: "localwiki-revisions", id, deletedAt, revisions: [...]}
     each revision:             {savedAt, keptAt, title, parentId, tags, icon, content}   (oldest first)
                                savedAt: when that version was last edited; keptAt: when it was kept

   When a version is kept: just before a page file is overwritten (or moved by a rename), the
   version on disk becomes a revision if it had rested unchanged for 10+ minutes (so the state
   before each editing session is kept), or if the last revision was kept 10+ minutes ago (a
   checkpoint during long sessions). A deleted page's last version is always kept.
   The first change to a page always keeps the original. Revisions from the last 7 days are all
   kept; older ones are thinned to one per day, at most 100 per page.

   Renames move the file (pages.js notes them in state.pendingRenames; undo notes the reverse).
   Deleting a page keeps its revisions and sets deletedAt, so it can be restored later.
   A revisions file that cannot be parsed is never overwritten.

   The rule functions at the top are pure (tested under Node); the rest runs during saves.
   Depends on: folder.js, state.js
   Provides:   LocalWiki.revisions */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const folder = LW.folder;
  const state = LW.state;
  const DIR = 'revisions';
  const MINUTE = 60e3, DAY = 864e5;
  const INTERVAL = 10 * MINUTE, KEEP_ALL_DAYS = 7, LIMIT = 100;

  // --- Rules (pure) -------------------------------------------------------------------------------
  // keptAt: ISO time the revision is recorded (defaults to the version's own time).
  function revisionOf(page, keptAt = page.updatedAt) {
    return {savedAt: page.updatedAt, keptAt, title: page.title, parentId: page.parentId ?? null, tags: [...(page.tags || [])], icon: page.icon || '', content: page.content};
  }
  // Same visible version, ignoring when it was saved.
  function sameVersion(a, b) {
    return a.title === b.title && a.content === b.content && a.parentId === b.parentId &&
      a.icon === b.icon && JSON.stringify(a.tags) === JSON.stringify(b.tags);
  }
  // Should `previous` (a page as it is on disk, about to be overwritten) become a revision?
  function worthKeeping(previous, revisions, now) {
    const newest = revisions[revisions.length - 1];
    if (!newest) return true;
    if (sameVersion(newest, revisionOf(previous))) return false;
    const edited = Date.parse(previous.updatedAt), lastKept = Date.parse(newest.keptAt ?? newest.savedAt);
    if (Number.isNaN(edited) || Number.isNaN(lastKept)) return true;
    return now - edited >= INTERVAL || now - lastKept >= INTERVAL;
  }
  // Keeps everything from the last KEEP_ALL_DAYS days, then the newest revision of each older day.
  function thin(revisions, now) {
    const kept = [], days = new Set();
    for (let i = revisions.length - 1; i >= 0; i--) {
      const revision = revisions[i], time = Date.parse(revision.savedAt);
      if (!(now - time > KEEP_ALL_DAYS * DAY)) { kept.push(revision); continue; }
      const day = new Date(time).toISOString().slice(0, 10);
      if (!days.has(day)) { days.add(day); kept.push(revision); }
    }
    return kept.reverse().slice(-LIMIT);
  }
  function addRevision(revisions, page, now) { return thin([...revisions, revisionOf(page, new Date(now).toISOString())], now); }

  // Line-by-line differences between two texts: [{type: 'same' | 'removed' | 'added', text}].
  function diffLines(before, after) {
    const a = before.split('\n'), b = after.split('\n');
    const same = text => ({type: 'same', text}), removed = text => ({type: 'removed', text}), added = text => ({type: 'added', text});
    // Unchanged lines at the start and end are matched directly; only the middle needs the table.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    const head = a.slice(0, start).map(same), tail = a.slice(endA).map(same);
    const n = endA - start, m = endB - start;
    if (n * m > 4e6) return [...head, ...a.slice(start, endA).map(removed), ...b.slice(start, endB).map(added), ...tail];
    // table[i][j] = length of the longest common sequence of lines a[i..] and b[j..].
    const width = m + 1, table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] = a[start + i] === b[start + j] ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    const middle = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) { middle.push(same(a[start + i])); i++; j++; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) middle.push(removed(a[start + i++]));
      else middle.push(added(b[start + j++]));
    }
    while (i < n) middle.push(removed(a[start + i++]));
    while (j < m) middle.push(added(b[start + j++]));
    return [...head, ...middle, ...tail];
  }

  // --- Files in the linked folder -----------------------------------------------------------------
  const BROKEN = Symbol('unreadable revisions file');
  const cache = new Map();   // page id -> revisions file object, null (none) or BROKEN
  let lastSaved = new Map(); // page id -> the page as it is on disk (what the next save overwrites)

  // Call when a different folder becomes the save target. pages: the pages as they are on disk.
  function reset(pages) {
    cache.clear();
    lastSaved = new Map(pages.map(page => [page.id, JSON.parse(JSON.stringify(page))]));
  }
  function noteRename(from, to) { state.pendingRenames.push([from, to]); }
  function blank(id) { return {type: 'localwiki-revisions', id, deletedAt: null, revisions: []}; }

  async function read(id) {
    if (cache.has(id)) return cache.get(id);
    let file = null;
    const dir = await folder.subfolder(state.folderHandle, DIR);
    if (dir) {
      try {
        const data = JSON.parse(await folder.readText(dir, id + '.json'));
        if (data?.type !== 'localwiki-revisions' || !Array.isArray(data.revisions)) throw new Error('not a revisions file');
        file = {type: data.type, id, deletedAt: typeof data.deletedAt === 'string' ? data.deletedAt : null,
          revisions: data.revisions.filter(r => r && typeof r.content === 'string' && typeof r.title === 'string')};
      } catch (err) {
        if (err.name !== 'NotFoundError') { console.warn(`Ignoring ${DIR}/${id}.json:`, err); file = BROKEN; }
      }
    }
    cache.set(id, file);
    return file;
  }

  // Called by storage.saveChanges before any page file is written or deleted.
  // pending: [[id, json text]] about to be written; staleIds: pages whose files are about to be deleted.
  async function beforeSave(pending, staleIds) {
    if (!state.folderHandle) return;
    const now = Date.now();
    const toWrite = new Map(), toRemove = new Set();
    const keepAlways = (file, page) => {
      const newest = file.revisions[file.revisions.length - 1];
      if (!newest || !sameVersion(newest, revisionOf(page))) file.revisions = addRevision(file.revisions, page, now);
    };
    // 1. Follow renames, in order (a rename and its undo cancel out).
    for (const [from, to] of state.pendingRenames.splice(0)) {
      const file = await read(from), existing = await read(to);
      if (file === BROKEN || existing === BROKEN) continue;
      const previous = lastSaved.get(from);
      if (!file && !previous) continue;
      const moved = {...blank(to), deletedAt: file?.deletedAt ?? null, revisions: [...(existing?.revisions ?? []), ...(file?.revisions ?? [])]};
      if (previous && worthKeeping(previous, moved.revisions, now)) moved.revisions = addRevision(moved.revisions, previous, now);
      lastSaved.delete(from);
      cache.set(from, null); cache.set(to, moved);
      toWrite.delete(from); toWrite.set(to, moved);
      toRemove.add(from); toRemove.delete(to);
    }
    // 2. Deleted pages keep their last saved version and are marked deleted.
    for (const id of staleIds) {
      const previous = lastSaved.get(id);
      if (!previous) continue; // renamed away (handled above) or never on disk
      const found = await read(id);
      if (found === BROKEN) continue;
      const file = found ? {...found} : blank(id);
      keepAlways(file, previous);
      file.deletedAt = new Date(now).toISOString();
      lastSaved.delete(id); cache.set(id, file); toWrite.set(id, file); toRemove.delete(id);
    }
    // 3. Pages about to be overwritten.
    for (const [id, text] of pending) {
      const found = toWrite.get(id) ?? await read(id);
      if (found === BROKEN) continue;
      let file = found, changed = false;
      if (file?.deletedAt) { file = {...file, deletedAt: null}; changed = true; } // restored
      const previous = lastSaved.get(id);
      if (previous && !sameVersion(revisionOf(previous), revisionOf(JSON.parse(text))) && worthKeeping(previous, file?.revisions ?? [], now)) {
        file = file ? {...file} : blank(id);
        file.revisions = addRevision(file.revisions, previous, now);
        changed = true;
      }
      if (changed) { cache.set(id, file); toWrite.set(id, file); }
    }
    if (!toWrite.size && !toRemove.size) return;
    const dir = await folder.subfolder(state.folderHandle, DIR, true);
    for (const file of toWrite.values()) await folder.writeText(dir, file.id + '.json', folder.jsonText(file));
    for (const id of toRemove) await folder.remove(dir, id + '.json');
  }
  // Called after a page file was written, so the next save knows what is on disk.
  function afterWrite(id, text) { lastSaved.set(id, JSON.parse(text)); }

  // --- Reading for the history dialog, backups --------------------------------------------------
  // Earlier versions of a page, oldest first.
  async function pageRevisions(id) {
    if (!state.folderHandle) return [];
    const file = await read(id);
    return file && file !== BROKEN ? file.revisions : [];
  }
  // Revisions files of deleted pages that are not back in the wiki, most recently deleted first.
  async function deletedPages() {
    const dir = state.folderHandle && await folder.subfolder(state.folderHandle, DIR);
    if (!dir) return [];
    const result = [];
    for (const name of await folder.fileNames(dir)) {
      if (!name.endsWith('.json')) continue;
      const file = await read(name.slice(0, -5));
      if (file && file !== BROKEN && file.deletedAt && file.revisions.length && !LW.store.pageById(file.id)) result.push(file);
    }
    return result.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }
  // Every revisions file as [path, text], for the ZIP export.
  async function allFiles() {
    const dir = state.folderHandle && await folder.subfolder(state.folderHandle, DIR);
    if (!dir) return [];
    const files = [];
    for (const name of await folder.fileNames(dir)) files.push([DIR + '/' + name, await folder.readText(dir, name)]);
    return files;
  }
  // Copies revisions/ from one wiki folder to another (Save to folder…).
  async function copyFolder(fromHandle, toHandle) {
    const from = await folder.subfolder(fromHandle, DIR);
    if (!from) return;
    const to = await folder.subfolder(toHandle, DIR, true);
    for (const name of await folder.fileNames(from)) await folder.writeText(to, name, await folder.readText(from, name));
  }

  LW.revisions = {
    revisionOf, sameVersion, worthKeeping, thin, addRevision, diffLines,
    reset, noteRename, beforeSave, afterWrite, pageRevisions, deletedPages, allFiles, copyFolder
  };
})();
