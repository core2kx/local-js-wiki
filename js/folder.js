/* LocalWiki — folder.js
   Small helpers over the browser's File System Access API (directory and file handles), shared by
   storage.js (pages, wiki.json) and revisions.js (revisions/). Missing files and folders raise
   errors named NotFoundError, as the browser does.

   Depends on: nothing (uses handles passed in).
   Also converts between images as data URLs (how the app holds the logo) and bytes (how it is
   stored), which works the same in the browser and under Node.
   Provides:   LocalWiki.folder */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});

  function jsonText(value) { return JSON.stringify(value, null, 2) + '\n'; }
  async function readBlob(dir, name) { return (await dir.getFileHandle(name)).getFile(); }
  // "data:<type>;base64,..." <-> bytes.
  async function blobToDataUrl(blob, type = blob.type || 'application/octet-stream') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return 'data:' + type + ';base64,' + btoa(binary);
  }
  function dataUrlToBytes(dataUrl) {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }
  async function readText(dir, name) {
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }
  // Writes a whole file (text or bytes); an interrupted write is aborted so the old file stays intact.
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

  LW.folder = {jsonText, readText, readBlob, writeText, remove, subfolder, fileNames, blobToDataUrl, dataUrlToBytes};
})();
