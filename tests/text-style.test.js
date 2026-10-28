'use strict';
/* Text sizes and colors: :size[large]{words} and :color[red]{words}. How they render, that the
   Visual editor round-trips them, and that every color is readable on every palette. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {parse} = require('./mini-dom');
const LW = load('icon-library', 'text', 'palettes', 'markdown', 'html-to-markdown');

const render = md => LW.markdown.toHtml(md, {linkExists: () => true});
const roundTrip = md => LW.htmlToMarkdown(parse(render(md)));

test('sizes and colors render as spans with fixed class names', () => {
  assert.match(render(':color[red]{hello}'), /<span class="text-red">hello<\/span>/);
  assert.match(render(':size[huge]{Big}'), /<span class="text-huge">Big<\/span>/);
});

test('they nest and hold other formatting, links and icons', () => {
  assert.match(render(':size[large]{:color[blue]{x}}'), /<span class="text-large"><span class="text-blue">x<\/span><\/span>/);
  assert.match(render(':color[green]{a **b** c}'), /<span class="text-green">a <strong>b<\/strong> c<\/span>/);
  assert.match(render(':color[red]{[[Page]]}'), /<span class="text-red"><a [^>]*wiki-link/);
  assert.match(render('**:color[red]{bold red}**'), /<strong><span class="text-red">bold red<\/span><\/strong>/);
});

test('unknown names, unclosed spans and stray braces stay plain text', () => {
  assert.doesNotMatch(render(':color[chartreuse]{x}'), /<span/);
  assert.doesNotMatch(render(':size[huge]{never closed'), /<span/);
  assert.equal(render('a } b'), '<p dir="auto">a } b</p>');
  assert.doesNotMatch(render(':color[red]{<script>x</script>}'), /<script>/);
});

test('an escaped brace does not end a span', () => {
  assert.match(render(':color[red]{a \\} b}'), /<span class="text-red">a } b<\/span>/);
});

test('the Visual editor round trip keeps sizes and colors', () => {
  for (const md of [':color[red]{hello}', 'Some :size[large]{big} words', ':size[large]{:color[blue]{both}}', ':color[green]{a **b** c}',
    '**:color[red]{bold red}**', '- item :color[gray]{muted}', '# Heading :size[small]{small}', ':color[red]{one} and :color[blue]{two}', ':color[red]{a \\} b}']) {
    assert.equal(roundTrip(md), md, md);
  }
});

test('text typed in the Visual editor cannot close a span by accident', () => {
  const md = LW.htmlToMarkdown(parse('<p><span class="text-red">closing } brace</span></p>'));
  assert.equal(md, ':color[red]{closing \\} brace}');
  assert.equal(roundTrip(md), md);
  assert.equal(LW.htmlToMarkdown(parse('<p>:color[red]{typed literally}</p>')), ':color\\[red\\]{typed literally\\}');
});

test('a span with both a size and a color keeps both, color outermost', () => {
  assert.equal(LW.htmlToMarkdown(parse('<p><span class="text-large text-red">x</span></p>')), ':color[red]{:size[large]{x}}');
  assert.equal(LW.htmlToMarkdown(parse('<p><span class="text-small">a</span> <span>plain</span></p>')), ':size[small]{a} plain');
});

test('spaces stay outside the markers', () => {
  assert.equal(LW.htmlToMarkdown(parse('<p>a<span class="text-red"> word </span>b</p>')), 'a :color[red]{word} b');
});

// --- contrast ---------------------------------------------------------------------------------------
const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every text color is readable (WCAG 4.5) on the page, editor and form backgrounds of every palette', () => {
  const {palettes} = LW;
  const failures = [];
  assert.deepEqual(Object.keys(palettes.TEXT_COLORS.light), palettes.TEXT_COLOR_NAMES);
  assert.deepEqual(Object.keys(palettes.TEXT_COLORS.dark), palettes.TEXT_COLOR_NAMES);
  for (const mode of ['light', 'dark']) for (const name of palettes.TEXT_COLOR_NAMES) {
    const color = palettes.TEXT_COLORS[mode][name];
    assert.match(color, /^#[0-9a-f]{6}$/, `${mode} ${name}`);
    for (const palette of palettes.list) for (const background of ['bg', 'panel', 'input', 'sidebar-bg']) {
      const ratio = contrast(color, palette[mode][background]);
      if (ratio < 4.5) failures.push(`${mode} ${name} on ${palette.id} ${background}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the colors in the stylesheet are the ones in the palettes file', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'css', 'wiki.css'), 'utf8');
  for (const name of LW.palettes.TEXT_COLOR_NAMES) assert.match(css, new RegExp('\\.text-' + name + ' \\{ color: var\\(--c-' + name + '\\); \\}'), name);
});
