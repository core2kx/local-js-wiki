/* LocalWiki — zip.js
   Minimal ZIP writer for "Export wiki ZIP". Files are stored uncompressed (STORE), with UTF-8
   filenames, so any unzip tool can read them. No external library.

   Pure function: no page (DOM) access; runs under Node.
   Depends on: nothing.
   Provides:   LocalWiki.zip */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});

  // files: [[path, text], ...] -> Blob of type application/zip
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
      // Local file header (flag 0x0800 = UTF-8 filename).
      const local = header(30, v => {
        v.setUint32(0, 0x04034B50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
        v.setUint32(14, crc, true); v.setUint32(18, content.length, true); v.setUint32(22, content.length, true);
        v.setUint16(26, path.length, true);
      });
      parts.push(local, path, content);
      const currentOffset = offset;
      offset += local.length + path.length + content.length;
      // Central directory entry pointing back at the local header.
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

  LW.zip = {makeZip};
})();
