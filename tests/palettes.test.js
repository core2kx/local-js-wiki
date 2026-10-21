'use strict';
/* Every palette must be complete and readable in both its light and dark version.
   Contrast ratios follow WCAG 2: 4.5 for normal text, 3 for large text and UI elements. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./load');
const {palettes} = load('palettes');

const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum ratio, what it is]
const PAIRS = [
  ['text', 'bg', 7, 'body text'], ['text', 'panel', 7, 'editor text'], ['text', 'sidebar-bg', 7, 'sidebar text'],
  ['muted', 'panel', 4.5, 'secondary text'], ['muted', 'sidebar-bg', 4.5, 'secondary text in the sidebar'],
  ['accent', 'panel', 4.5, 'links'], ['accent', 'accent-soft', 4.5, 'active sidebar item'],
  ['text', 'accent-soft', 4.5, 'search highlight in the sidebar'], ['text', 'input', 7, 'form fields'],
  ['on-accent', 'accent', 4.5, 'button text'], ['on-accent', 'accent-hover', 4.5, 'button text on hover'],
  ['warning', 'panel', 4.5, 'unsaved-changes notice'], ['highlight-text', 'highlight', 4.5, 'search highlight'],
  ['text', 'diff-added', 4.5, 'added lines'], ['text', 'diff-removed', 4.5, 'removed lines']
];

test('every palette defines every color as a hex value, in light and dark', () => {
  assert.ok(palettes.list.length >= 6);
  assert.equal(new Set(palettes.list.map(p => p.id)).size, palettes.list.length);
  for (const palette of palettes.list) for (const mode of ['light', 'dark']) {
    assert.deepEqual(Object.keys(palette[mode]).sort(), [...palettes.TOKENS].sort(), `${palette.id} ${mode}`);
    for (const [token, value] of Object.entries(palette[mode])) assert.match(value, /^#[0-9a-f]{6}$/, `${palette.id} ${mode} ${token}`);
  }
});

test('every palette is readable (WCAG contrast) in light and dark', () => {
  const failures = [];
  for (const palette of palettes.list) for (const mode of ['light', 'dark']) {
    const colors = palette[mode];
    for (const [fg, bg, min, what] of PAIRS) {
      const ratio = contrast(colors[fg], colors[bg]);
      if (ratio < min) failures.push(`${palette.id} ${mode}: ${what} (${fg} on ${bg}) ${ratio.toFixed(2)} < ${min}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('unknown palette ids fall back to the default', () => {
  assert.equal(palettes.byId('nope').id, palettes.DEFAULT_ID);
  assert.equal(palettes.byId('ocean').id, 'ocean');
});
