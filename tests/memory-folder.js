'use strict';
/* Test helper: an in-memory stand-in for the browser's File System Access API (directory and
   file handles), with a log of writes and deletes so tests can check exactly what was touched. */

class MemoryDirectory {
  constructor(name) { this.name = name; this.kind = 'directory'; this.files = new Map(); this.dirs = new Map(); this.log = []; }
  async getFileHandle(name, {create = false} = {}) {
    if (!this.files.has(name)) {
      if (!create) throw new DOMException('Not found: ' + name, 'NotFoundError');
      this.files.set(name, '');
    }
    const dir = this;
    return {
      kind: 'file',
      async getFile() { return {text: async () => dir.files.get(name)}; },
      async createWritable() {
        let buffer = '';
        return {write: async text => { buffer += text; }, close: async () => { dir.files.set(name, buffer); dir.log.push('write ' + name); }, abort: async () => {}};
      }
    };
  }
  async getDirectoryHandle(name, {create = false} = {}) {
    if (!this.dirs.has(name)) {
      if (!create) throw new DOMException('Not found: ' + name, 'NotFoundError');
      this.dirs.set(name, new MemoryDirectory(name));
    }
    return this.dirs.get(name);
  }
  async *entries() {
    for (const name of this.files.keys()) yield [name, await this.getFileHandle(name)];
    for (const [name, dir] of this.dirs) yield [name, dir];
  }
  async removeEntry(name) {
    if (!this.files.delete(name)) throw new DOMException('Not found: ' + name, 'NotFoundError');
    this.log.push('delete ' + name);
  }
}

module.exports = {MemoryDirectory};
