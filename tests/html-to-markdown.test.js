'use strict';
/* The visual editor saves pages by converting its HTML back to Markdown. These tests check that
   Markdown -> HTML -> Markdown is lossless for everything the wiki supports, that text typed in
   the visual editor stays literal, and that markup added by browser editing commands converts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {parse} = require('./mini-dom');
const LW = load('icon-library', 'text', 'markdown', 'html-to-markdown');

const render = md => LW.markdown.toHtml(md, {linkExists: target => target !== 'Missing page'});
const roundTrip = md => LW.htmlToMarkdown(parse(render(md)));
const fromHtml = html => LW.htmlToMarkdown(parse(html));

test('every supported construct survives a round trip unchanged', () => {
  const documents = [
    '# Title\n\n## Section\n\n### Sub\n\n#### Deep',
    'Plain paragraph with **bold**, *italic*, ~~struck~~ and `code`.',
    'Line one\nline two of the same paragraph',
    'See [[Welcome]], [[welcome|the start page]], [[Missing page]] and [Dell](https://www.dell.com).',
    'Icons :icon[server]: and :icon[network]: inline.',
    '- one\n- two **bold**\n- three',
    '1. first\n2. second',
    '1. Step one\n\n```\ncommand\n```\n\n2. Step two continues the numbering',
    'Use `` `code` `` for inline code, and `plain` too.',
    '> A quoted line',
    '---',
    '```\nshow version\n  indented <tag> & stuff\n```',
    '| Device | Status |\n| --- | --- |\n| :icon[server]: Server | ✅ Online |\n| Switch | **Down** |',
    '| A \\| B | C |\n| --- | --- |\n| x |  |',
    'Unicode: Привет мир, 東京, שלום, Ελληνικά',
    '# Title\n\nIntro paragraph.\n\n- item\n\n| H |\n| --- |\n| v |\n\nAfter.'
  ];
  for (const md of documents) assert.equal(roundTrip(md), md, md);
});

test('characters typed as text stay literal (escaped, then rendered as typed)', () => {
  const typed = ['*not italic*', '__not bold__', '~~not struck~~', '[[not a link]]', '[x](https://example.com)',
    'a `tick', 'C:\\path\\file', ':icon[server]:', 'pipe | here', '# not a heading', '- not a list', '1. not a list',
    '> not a quote', '---', '```'];
  for (const value of typed) {
    const md = fromHtml('<p>' + value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>');
    const shown = parse(render(md)).childNodes[0];
    const textOf = n => n.nodeType === 3 ? n.nodeValue : n.childNodes.map(textOf).join('');
    assert.equal(textOf(shown), value, `${value} -> ${md}`);
    assert.equal(shown.nodeName, 'P', `${value} stays a paragraph`);
    assert.ok(!render(md).includes('<strong>') && !render(md).includes('<em>') && !render(md).includes('wiki-link') && !render(md).includes('<svg'), value);
  }
});

test('markup from browser editing commands converts', () => {
  assert.equal(fromHtml('<div>First</div><div>Second <b>bold</b> <i>it</i> <strike>gone</strike></div>'), 'First\n\nSecond **bold** *it* ~~gone~~');
  assert.equal(fromHtml('<p>a<br>b</p>'), 'a\nb');
  assert.equal(fromHtml('<p><span style="color:red">kept text</span> <font>too</font></p>'), 'kept text too');
  assert.equal(fromHtml('Loose text<div>then a block</div>'), 'Loose text\n\nthen a block');
  assert.equal(fromHtml('<ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul>'), '- a\n- nested\n- b');
  assert.equal(fromHtml('<p><b>bold </b>next</p>'), '**bold** next');
  assert.equal(fromHtml('<p><b></b>empty</p>'), 'empty');
  assert.equal(fromHtml('<p>&nbsp;</p><p>x</p><p><br></p>'), 'x');
  assert.equal(fromHtml('<pre>line 1<br>line 2</pre>'), '```\nline 1\nline 2\n```');
  assert.equal(fromHtml('<pre>a<br>b<br><br><br></pre>'), '```\na\nb\n```');
  assert.equal(fromHtml('<h2>Head <b>bold</b></h2>'), '## Head **bold**');
  assert.equal(fromHtml('<a href="javascript:alert(1)">bad</a>'), 'bad');
  assert.equal(fromHtml('<p><img src="x.png">no images<script>x()</script></p>'), 'no images');
});

test('wiki link labels and targets cannot break the link syntax', () => {
  assert.equal(fromHtml('<a class="wiki-link" data-wiki-target="Page">Page</a>'), '[[Page]]');
  assert.equal(fromHtml('<a class="wiki-link" data-wiki-target="Page">a [b] | c</a>'), '[[Page|a b c]]');
  assert.equal(fromHtml('<a href="https://x.test/a b)">x</a>'), '[x](https://x.test/a%20b%29)');
});
