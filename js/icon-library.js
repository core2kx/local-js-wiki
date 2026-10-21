/* LocalWiki — icon-library.js
   Compact, self-contained SVG icon set. No external fonts, CDN, or package dependencies.
   All pictograms are stored locally as SVG strokes; extend ICONS to add another.
   Page text refers to icons as :icon[name]: and page icons as "icon:name"; only names listed
   here are ever turned into SVG.

   Depends on: nothing.
   Provides:   LocalWiki.icons {items, svg(name), has(name)} */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ICONS = {
    "book": { label: "Book", art: "<path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z\"/><path d=\"M4 5.5V20a2 2 0 0 1 2.5-2H20\"/>" },
    "file": { label: "File", art: "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v5h5\"/>" },
    "folder": { label: "Folder", art: "<path d=\"M3 6h7l2 2h9v12H3z\"/>" },
    "home": { label: "Home", art: "<path d=\"m3 11 9-8 9 8\"/><path d=\"M5 10v11h14V10M10 21v-7h4v7\"/>" },
    "server": { label: "Server", art: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"13\" width=\"18\" height=\"8\" rx=\"2\"/><circle cx=\"7\" cy=\"7\" r=\"1\"/><circle cx=\"7\" cy=\"17\" r=\"1\"/>" },
    "database": { label: "Database", art: "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0\"/>" },
    "network": { label: "Network", art: "<rect x=\"9\" y=\"2\" width=\"6\" height=\"5\" rx=\"1\"/><rect x=\"2\" y=\"17\" width=\"6\" height=\"5\" rx=\"1\"/><rect x=\"16\" y=\"17\" width=\"6\" height=\"5\" rx=\"1\"/><path d=\"M12 7v5M5 17v-5h14v5\"/>" },
    "wifi": { label: "Wi-Fi", art: "<path d=\"M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M9 17a4 4 0 0 1 6 0\"/><circle cx=\"12\" cy=\"21\" r=\"1\"/>" },
    "globe": { label: "Globe", art: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c-6 6-6 12 0 18M12 3c6 6 6 12 0 18\"/>" },
    "settings": { label: "Settings", art: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M10 2h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2l-2-2 2-4 3 1 2-1z\"/>" },
    "wrench": { label: "Wrench", art: "<path d=\"M14 4a7 7 0 0 1 7 8l-5-3-4 4 3 5a7 7 0 0 1-8-7L3 17a3 3 0 1 0 4 4l6-7\"/>" },
    "shield": { label: "Shield", art: "<path d=\"m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6z\"/>" },
    "lock": { label: "Lock", art: "<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3M12 14v3\"/>" },
    "cloud": { label: "Cloud", art: "<path d=\"M7 19h11a4 4 0 0 0 .2-8 7 7 0 0 0-13-2.5A5 5 0 0 0 7 19z\"/>" },
    "terminal": { label: "Terminal", art: "<rect x=\"2\" y=\"3\" width=\"20\" height=\"18\" rx=\"2\"/><path d=\"m6 9 3 3-3 3m6 0h6\"/>" },
    "code": { label: "Code", art: "<path d=\"m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-3 18\"/>" },
    "calendar": { label: "Calendar", art: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 2v6m10-6v6M3 10h18\"/>" },
    "clock": { label: "Clock", art: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 6v6l4 3\"/>" },
    "link": { label: "Link", art: "<path d=\"m10 13 4-4M9 7l2-2a5 5 0 1 1 7 7l-2 2M15 17l-2 2a5 5 0 1 1-7-7l2-2\"/>" },
    "search": { label: "Search", art: "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m16 16 5 5\"/>" },
    "check": { label: "Check", art: "<path d=\"m4 12 5 5L20 6\"/>" },
    "warning": { label: "Warning", art: "<path d=\"m12 3 10 18H2z\"/><path d=\"M12 9v5m0 3v.5\"/>" },
    "info": { label: "Information", art: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6m0-10v1\"/>" },
    "star": { label: "Star", art: "<path d=\"m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z\"/>" },
    "pin": { label: "Pin", art: "<path d=\"M12 22s8-8 8-13a8 8 0 0 0-16 0c0 5 8 13 8 13z\"/><circle cx=\"12\" cy=\"9\" r=\"3\"/>" },
    "table": { label: "Table", art: "<rect x=\"2\" y=\"3\" width=\"20\" height=\"18\" rx=\"1\"/><path d=\"M2 9h20M2 15h20M9 9v12M16 9v12\"/>" },
    "phone": { label: "Phone", art: "<path d=\"m6 3 4 4-2 3a15 15 0 0 0 6 6l3-2 4 4-3 3C10 21 3 14 3 6z\"/>" },
    "mail": { label: "Mail", art: "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 7 9-7\"/>" },
    "laptop": { label: "Laptop", art: "<rect x=\"4\" y=\"3\" width=\"16\" height=\"14\" rx=\"1\"/><path d=\"M2 21h20l-2-4H4z\"/>" },
    "arrow-right": { label: "Arrow right", art: "<path d=\"M3 12h18m-7-7 7 7-7 7\"/>" },
    "users": { label: "Users", art: "<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M2 21v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5\"/>" },
    "rocket": { label: "Rocket", art: "<path d=\"M5 15c0-7 7-12 16-13-1 9-6 16-13 16zM9 9l6 6M3 21l4-4m-2-4-3 1v4m11 2 1-3h4\"/>" }
  };
  function svg(name) {
    const entry = ICONS[name];
    if (!entry) return '';
    return '<svg class="wiki-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + entry.art + '</svg>';
  }
  LW.icons = Object.freeze({items: Object.keys(ICONS).map(name => ({name, label: ICONS[name].label})), svg, has: name => Object.hasOwn(ICONS,name)});
})();
