'use strict';
/* Test helper: a tiny HTML parser producing DOM-like nodes (nodeType, nodeName, childNodes,
   nodeValue, getAttribute) — just enough for html-to-markdown.js. It reads well-formed HTML such
   as markdown.js produces; it is not a general-purpose browser parser. */

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' '};
const decode = text => text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, name) => {
  if (ENTITIES[name] !== undefined) return ENTITIES[name];
  if (name[0] === '#') return String.fromCodePoint(name[1] === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  return m;
});

function element(name, attributes = {}) {
  return {
    nodeType: 1, nodeName: name.toUpperCase(), childNodes: [], attributes,
    getAttribute(key) { return key in this.attributes ? this.attributes[key] : null; }
  };
}
const text = value => ({nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: []});

// Parses an HTML fragment into a root element whose children are the fragment's top-level nodes.
function parse(html) {
  const root = element('div');
  const stack = [root];
  const tag = /<\/?([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  let at = 0, m;
  while ((m = tag.exec(html))) {
    if (m.index > at) stack[stack.length - 1].childNodes.push(text(decode(html.slice(at, m.index))));
    at = tag.lastIndex;
    const name = m[1].toLowerCase();
    if (m[0][1] === '/') {
      while (stack.length > 1 && stack.pop().nodeName !== name.toUpperCase()) { /* close up to the match */ }
      continue;
    }
    const attributes = {};
    for (const [, key, value] of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[key] = value === undefined ? '' : decode(value);
    const node = element(name, attributes);
    stack[stack.length - 1].childNodes.push(node);
    if (!VOID.has(name) && !m[3]) stack.push(node);
  }
  if (at < html.length) stack[stack.length - 1].childNodes.push(text(decode(html.slice(at))));
  return root;
}

module.exports = {parse, element, text};
