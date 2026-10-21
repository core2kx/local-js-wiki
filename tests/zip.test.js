'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const {load} = require('./load');
const {zip} = load('zip');

// Reads a STORE-only ZIP through its central directory, checking signatures and CRCs.
function readZip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const end = buffer.byteLength - 22;
  assert.equal(view.getUint32(end, true), 0x06054B50, 'end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014B50, 'central directory entry');
    assert.equal(view.getUint16(at + 8, true) & 0x0800, 0x0800, 'UTF-8 filename flag');
    const crc = view.getUint32(at + 16, true), size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    assert.equal(view.getUint32(local, true), 0x04034B50, 'local header');
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = buffer.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, 'CRC of ' + name);
    files[name] = data.toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

test('makeZip writes readable entries with UTF-8 names', async () => {
  const input = [['wiki.json', '{"a":1}\n'], ['pages/привет.json', 'Привет 👋'], ['pages/empty.json', '']];
  const blob = zip.makeZip(input);
  assert.equal(blob.type, 'application/zip');
  const files = readZip(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(files, Object.fromEntries(input));
});
