'use strict';
/* The version in js/version.js, the newest released section of CHANGELOG.md, and the version
   shown to people must agree, so a release cannot be half done. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
require(path.join(root, 'js', 'version.js'));
const {version} = globalThis.LocalWiki;

test('the version is a Semantic Version', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

test('the changelog\'s newest release is the current version', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const releases = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) —/gm)].map(match => match[1]);
  assert.equal(releases[0], version);
  assert.equal(new Set(releases).size, releases.length, 'a version appears twice');
});

test('index.html loads version.js', () => {
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<script defer src="js\/version\.js"><\/script>/);
});
