/* LocalWiki — folder.js
   Small helpers over the browser's File System Access API (directory and file handles), shared by
   storage.js (pages, wiki.json) and revisions.js (revisions/). Missing files and folders raise
   errors named NotFoundError, as the browser does.

   Depends on: nothing (uses handles passed in).
   Provides:   LocalWiki.folder */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});

  function jsonText(value) { return JSON.stringify(value, null, 2) + '\n'; }
  async function readText(dir, name) {
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }
  // Writes a whole file; an interrupted write is aborted so the old file stays intact.
  async function writeText(dir, name, text) {
    const writer = await (await dir.getFileHandle(name, {create: true})).createWritable();
    try { await writer.write(text); await writer.close(); }
    catch (err) { try { await writer.abort(); } catch (_) {} throw err; }
  }
  // Deletes a file; a file that is already gone is fine.
  async function remove(dir, name) {
    try { await dir.removeEntry(name); }
    catch (err) { if (err.name !== 'NotFoundError') throw err; }
  }
  // A subfolder, or null when it does not exist and create is false.
  async function subfolder(dir, name, create = false) {
    try { return await dir.getDirectoryHandle(name, {create}); }
    catch (err) { if (err.name === 'NotFoundError') return null; throw err; }
  }
  // Names of the files directly inside a folder.
  async function fileNames(dir) {
    const names = [];
    for await (const [name, handle] of dir.entries()) if (handle.kind === 'file') names.push(name);
    return names.sort();
  }

  LW.folder = {jsonText, readText, writeText, remove, subfolder, fileNames};
})();
