/* LocalWiki — palettes.js
   Color palettes. Each palette is a matched set of colors for every part of the screen, in a light
   and a dark version, so it works with either theme. ui/appearance.js applies the chosen palette by
   setting the CSS variables of the same names (see css/wiki.css).

   Colors per version:
     bg, panel, sidebar-bg, input      backgrounds: page, cards/editor, sidebar, form fields
     text, muted, border               text, secondary text, lines
     accent, accent-hover, accent-soft links, buttons, active items; hover; light accent background
     on-accent                         text on accent-colored buttons
     warning                           "Unsaved changes" and load problems
     highlight, highlight-text         search matches
     diff-added, diff-removed          page history comparisons

   tests/palettes.test.js checks every palette for readable contrast (WCAG ratios).
   Pure data: runs under Node.
   Depends on: nothing.
   Provides:   LocalWiki.palettes {list, byId(id), DEFAULT_ID, TOKENS} */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const TOKENS = ['bg', 'panel', 'sidebar-bg', 'input', 'text', 'muted', 'border', 'accent', 'accent-hover', 'accent-soft',
    'on-accent', 'warning', 'highlight', 'highlight-text', 'diff-added', 'diff-removed'];
  // Shorthand: values in TOKENS order.
  const v = values => Object.fromEntries(TOKENS.map((token, i) => [token, values[i]]));

  const list = [
    {id: 'evergreen', name: 'Evergreen',
      light: v(['#f6f8f8', '#ffffff', '#f0f4f3', '#ffffff', '#23342f', '#626f6c', '#dce6e2', '#2e766b', '#245e55', '#e5f3f0', '#ffffff', '#9a5f17', '#fbe8af', '#3f351a', '#e3f4ec', '#fbe6e4']),
      dark: v(['#17211f', '#1e2b28', '#1a2723', '#182420', '#e4ede9', '#9caeaa', '#354940', '#80c7b6', '#a0decf', '#2c463f', '#10201c', '#e0a95a', '#5b4a17', '#fbeec7', '#1f4033', '#4a2a28'])},
    {id: 'ocean', name: 'Ocean',
      light: v(['#f5f8fb', '#ffffff', '#eef3f8', '#ffffff', '#1f2d3d', '#5f6f81', '#d8e2ec', '#2563a8', '#1d4f87', '#e4eef9', '#ffffff', '#a6620f', '#fde9a8', '#3d3212', '#e2f2ea', '#fbe5e3']),
      dark: v(['#121a24', '#1a2533', '#16202c', '#141e2a', '#e3eaf3', '#93a3b6', '#2e3d50', '#7fb3ea', '#a3c9f1', '#22364d', '#0d1723', '#e6ae5e', '#574818', '#fcefc5', '#1d3b2f', '#472a2a'])},
    {id: 'slate', name: 'Slate',
      light: v(['#f6f6f7', '#ffffff', '#efeff1', '#ffffff', '#24262b', '#686b74', '#dedfe3', '#4b5563', '#374151', '#ececef', '#ffffff', '#9a5c07', '#fbeaa9', '#3c3214', '#e4f1e8', '#f8e6e6']),
      dark: v(['#16171a', '#1f2024', '#1a1b1e', '#18191c', '#e7e8ea', '#9a9ca3', '#34363c', '#b8bec9', '#d4d8de', '#2c2e33', '#16171a', '#e3ac5c', '#534619', '#faeec6', '#20362a', '#45292a'])},
    {id: 'plum', name: 'Plum',
      light: v(['#f8f6fa', '#ffffff', '#f2eef6', '#ffffff', '#2d2436', '#74697f', '#e3dcea', '#7a3e9d', '#632f81', '#f1e8f7', '#ffffff', '#9c5d17', '#fbe7ab', '#3e3317', '#e4f2e9', '#fbe5e6']),
      dark: v(['#1b1621', '#241e2c', '#1f1926', '#1d1824', '#ece6f2', '#a89cb4', '#3b3146', '#c9a2e3', '#dcc0ee', '#3a2c47', '#1b1621', '#e3a95e', '#574817', '#fbeec7', '#20382c', '#4a2a30'])},
    {id: 'ember', name: 'Ember',
      light: v(['#faf7f4', '#ffffff', '#f5efe9', '#ffffff', '#33261e', '#79685c', '#eadfd5', '#ac4d26', '#923f1d', '#f8eae2', '#ffffff', '#865900', '#f8e3a3', '#3d3112', '#e5f1e5', '#f9e2e0']),
      dark: v(['#1f1814', '#2a211b', '#241c17', '#211a15', '#f1e7df', '#b3a091', '#45362c', '#ee9a72', '#f4b89b', '#4a3024', '#1f1814', '#e8c065', '#5a4716', '#fcefc4', '#24382a', '#4d2b26'])},
    {id: 'rose', name: 'Rose',
      light: v(['#fbf6f7', '#ffffff', '#f6eef0', '#ffffff', '#352328', '#7b666d', '#ecdde1', '#ad3457', '#922a4a', '#f9e6ec', '#ffffff', '#8f5c10', '#fae6a9', '#3e3216', '#e4f2e8', '#f8e3e3']),
      dark: v(['#1f1619', '#2a1f23', '#24191d', '#21181b', '#f3e7eb', '#b39ea5', '#46323a', '#f08aa9', '#f5aec4', '#4a2834', '#1f1619', '#e6b161', '#574718', '#fbeec6', '#213a2b', '#4d2a2d'])},
    {id: 'forest', name: 'Forest',
      light: v(['#f5f7f2', '#ffffff', '#edf1e7', '#ffffff', '#25301f', '#646e5a', '#dbe3d1', '#467329', '#3a6222', '#eaf2e2', '#ffffff', '#985a18', '#f9e7a4', '#3c3314', '#e2f1e4', '#f9e4e1']),
      dark: v(['#151a12', '#1d2419', '#191f15', '#171d14', '#e6ecdf', '#a0ab95', '#343f2c', '#a6d17f', '#c1e2a2', '#2c3a22', '#151a12', '#e2ad5d', '#534716', '#faeec5', '#223a26', '#4a2b28'])},
    {id: 'contrast', name: 'High contrast',
      light: v(['#ffffff', '#ffffff', '#f2f2f2', '#ffffff', '#000000', '#3d3d3d', '#7a7a7a', '#0047ab', '#003380', '#e0eaff', '#ffffff', '#7a4200', '#ffe86b', '#000000', '#d4f4dd', '#ffd9d9']),
      dark: v(['#000000', '#0d0d0d', '#050505', '#0a0a0a', '#ffffff', '#cfcfcf', '#8a8a8a', '#8ab4ff', '#b3ceff', '#1a2a4a', '#000000', '#ffb74d', '#6b5800', '#ffffff', '#0f3d1e', '#4d1414'])}
  ];
  const DEFAULT_ID = 'evergreen';
  const byId = id => list.find(p => p.id === id) || list.find(p => p.id === DEFAULT_ID);

  LW.palettes = Object.freeze({list, byId, DEFAULT_ID, TOKENS});
})();
