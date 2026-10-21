'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {markdown} = load('icon-library', 'text', 'markdown');

const render = (source, existing = []) => markdown.toHtml(source, {linkExists: target => existing.includes(target)});

test('page text is escaped; scripts never become markup', () => {
  const html = render('<script>alert(1)</script> **bold** `<b>`');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<code>&lt;b&gt;</code>'));
});

test('wiki links, missing links, external links and icons', () => {
  const html = render('[[Home]] [[gone|Label]] [site](https://example.com) :icon[server]: :icon[nope]:', ['Home']);
  assert.match(html, /class="wiki-link" data-wiki-target="Home">Home<\/a>/);
  assert.match(html, /class="wiki-link missing-link" data-wiki-target="gone">Label<\/a>/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.match(html, /<svg class="wiki-svg-icon"/);
  assert.ok(html.includes(':icon[nope]:')); // unknown icons stay as text
  assert.ok(!render('[x](javascript:alert(1))').includes('href'));
});

test('block elements', () => {
  const html = render('# Title\n\n- one\n- two\n\n1. first\n\n> quote\n\n---\n\n```\n<raw>\n```\n\nline one\nline two');
  for (const piece of ['<h1 dir="auto">Title</h1>', '<ul><li dir="auto">one</li><li dir="auto">two</li></ul>', '<ol>', '<blockquote dir="auto">quote</blockquote>', '<hr>', '<pre><code>&lt;raw&gt;</code></pre>', 'line one<br>line two']) {
    assert.ok(html.includes(piece), piece);
  }
});

test('numbered lists keep their first number; double backticks allow ` in code', () => {
  assert.ok(render('3. third\n4. fourth').startsWith('<ol start="3">'));
  assert.ok(render('1. first').startsWith('<ol>'));
  assert.ok(render('Use `` `x` `` here').includes('<code>`x`</code>'));
});

test('tables render, can be found by line, and round-trip through tableMarkdown', () => {
  const source = 'intro\n\n| A | B \\| C |\n| --- | --- |\n| 1 | 2 |\n\nafter';
  assert.match(render(source), /<th dir="auto">B \| C<\/th>/);
  const found = markdown.findTableAt(source, 4);
  assert.deepEqual(found, {startLine: 2, endLine: 5, values: [['A', 'B | C'], ['1', '2']]});
  assert.equal(markdown.findTableAt(source, 0), null);
  assert.equal(markdown.tableMarkdown(found.values), '| A | B \\| C |\n| --- | --- |\n| 1 | 2 |');
});

test('rewriteLinks changes links outside code and keeps labels', () => {
  const content = 'See [[Old]] and [[old-id|label]].\n`[[Old]]` in code\n```\n[[Old]]\n```\n[[Other]]';
  const isTarget = target => (target === 'Old' ? 'title' : target === 'old-id' ? 'id' : null);
  const result = markdown.rewriteLinks(content, isTarget, kind => (kind === 'id' ? 'new-id' : 'New'));
  assert.equal(result, 'See [[New]] and [[new-id|label]].\n`[[Old]]` in code\n```\n[[Old]]\n```\n[[Other]]');
});
