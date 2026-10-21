/* LocalWiki — html-to-markdown.js
   Turns the visual editor's content (HTML) back into the wiki's Markdown, so pages are always
   stored as Markdown. It understands everything markdown.js produces, plus what the browser's
   editing commands add (<b>, <i>, <div>, <br>, ...); anything else is reduced to its text.

   Characters that would otherwise become formatting are escaped with a backslash, so text typed in
   the visual editor stays exactly as typed (see markdown.js for the escapes).

   Pure: works on any DOM-like tree (nodeType, nodeName, childNodes, nodeValue, getAttribute), so
   it runs under Node in the tests with a tiny HTML parser.
   Depends on: nothing.
   Provides:   LocalWiki.htmlToMarkdown(rootElement) -> string */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const TEXT = 3, ELEMENT = 1;
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'IMG', 'SVG', 'svg', 'INPUT', 'TEXTAREA', 'SELECT']);

  const hasClass = (node, name) => (node.getAttribute?.('class') || '').split(/\s+/).includes(name);
  const isBlock = node => node.nodeType === ELEMENT && BLOCK.has(node.nodeName);
  // All text below a node; <br> becomes a newline.
  function textOf(node) {
    if (node.nodeType === TEXT) return node.nodeValue;
    if (node.nodeType !== ELEMENT) return '';
    if (node.nodeName === 'BR') return '\n';
    return Array.from(node.childNodes, textOf).join('');
  }

  // --- Inline content -----------------------------------------------------------------------------
  // Backslash-escape characters that would start formatting, links, code or icons.
  function escapeText(text) {
    return text.replace(/[\\`*[\]|]/g, '\\$&').replace(/__/g, '\\_\\_').replace(/~~/g, '\\~\\~');
  }
  // Puts markers around text, keeping surrounding spaces outside (and each line separate).
  function wrap(marker, text) {
    return text.split('\n').map(line => {
      const [, before, inner, after] = line.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return inner ? before + marker + inner + marker + after : line;
    }).join('\n');
  }
  // Text for places that are not parsed as Markdown ([[target|label]], [label](url)).
  const plain = text => text.replace(/[[\]|\n]/g, ' ').replace(/\s+/g, ' ').trim();

  function inline(nodes) { return Array.from(nodes, inlineNode).join(''); }
  function inlineNode(node) {
    if (node.nodeType === TEXT) return escapeText(node.nodeValue.replace(/[\s\u00a0]+/g, ' '));
    if (node.nodeType !== ELEMENT || SKIP.has(node.nodeName)) return '';
    if (node.nodeName === 'BR') return '\n';
    if (hasClass(node, 'inline-wiki-icon')) {
      const name = node.getAttribute('data-icon');
      return name && /^[a-z0-9-]+$/.test(name) ? ':icon[' + name + ']:' : '';
    }
    switch (node.nodeName) {
      case 'STRONG': case 'B': return wrap('**', inline(node.childNodes));
      case 'EM': case 'I': return wrap('*', inline(node.childNodes));
      case 'DEL': case 'S': case 'STRIKE': return wrap('~~', inline(node.childNodes));
      case 'CODE': {
        const code = textOf(node).replace(/\n/g, ' ');
        if (!code.trim()) return code;
        return code.includes('`') ? '`` ' + code + ' ``' : '`' + code + '`';
      }
      case 'A': {
        const label = plain(textOf(node));
        if (hasClass(node, 'wiki-link')) {
          const target = plain(node.getAttribute('data-wiki-target') || '');
          if (!target) return escapeText(label);
          return '[[' + target + (label && label !== target ? '|' + label : '') + ']]';
        }
        const href = (node.getAttribute('href') || '').trim();
        if (label && /^(https?:\/\/|mailto:)/i.test(href)) return '[' + label + '](' + href.replace(/\s/g, '%20').replace(/\)/g, '%29') + ')';
        return escapeText(label);
      }
      default: return inline(node.childNodes); // <span>, <font>, <u>, ... keep only their content
    }
  }

  // A line that would be read as a heading, list item, quote or rule gets a protective backslash.
  function escapeLineStart(line) {
    return line
      .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
      .replace(/^([-+])(?=\s)/, '\\$1')
      .replace(/^(\d+)\.(?=\s)/, '$1\\.')
      .replace(/^>/, '\\>')
      .replace(/^(-{3,}\s*)$/, '\\$1');
  }
  // Inline nodes as one paragraph (lines kept), or null when empty.
  function paragraph(nodes) {
    const lines = inline(nodes).split('\n').map(line => escapeLineStart(line.trim()));
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    if (!lines.length) return null;
    // An empty line in the middle would split the paragraph; keep the text together instead.
    return lines.filter(Boolean).join('\n');
  }
  const oneLine = nodes => inline(nodes).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  // --- Blocks -------------------------------------------------------------------------------------
  // Converts the children of a container; inline runs between blocks become paragraphs.
  function blocks(container, out) {
    let run = [];
    const flush = () => { if (run.length) { out.push(paragraph(run)); run = []; } };
    for (const node of container.childNodes) {
      if (isBlock(node)) { flush(); block(node, out); }
      else run.push(node);
    }
    flush();
  }
  function block(node, out) {
    const name = node.nodeName;
    if (/^H[1-6]$/.test(name)) {
      const text = oneLine(node.childNodes);
      if (text) out.push('#'.repeat(Number(name[1])) + ' ' + text);
      return;
    }
    if (name === 'HR') { out.push('---'); return; }
    if (name === 'PRE') {
      const code = textOf(node).replace(/\u00a0/g, ' ').replace(/\n+$/, ''); // trailing blank lines are not kept
      out.push('```\n' + code + '\n```');
      return;
    }
    if (name === 'BLOCKQUOTE') {
      const parts = [];
      blocks(node, parts);
      const text = parts.filter(Boolean).join(' ').replace(/\n/g, ' ').trim();
      if (text) out.push('> ' + text);
      return;
    }
    if (name === 'UL' || name === 'OL') { out.push(list(node, name === 'OL' ? Number(node.getAttribute('start')) || 1 : 0)); return; }
    if (name === 'LI') { const text = oneLine(node.childNodes); if (text) out.push('- ' + text); return; }
    if (name === 'TABLE' || hasClass(node, 'table-block')) { out.push(table(node)); return; }
    // P, DIV, SECTION...: a paragraph, unless it wraps other blocks (browsers sometimes nest them).
    if (Array.from(node.childNodes).some(isBlock)) blocks(node, out);
    else out.push(paragraph(node.childNodes));
  }
  // Nested lists are flattened: the wiki's Markdown has one list level.
  // start: first number of a numbered list, or 0 for a bulleted list.
  function list(node, start) {
    const items = [];
    const collect = listNode => {
      for (const child of listNode.childNodes) {
        if (child.nodeName === 'LI') {
          const own = Array.from(child.childNodes).filter(n => n.nodeName !== 'UL' && n.nodeName !== 'OL');
          const text = oneLine(own);
          if (text) items.push(text);
          for (const nested of child.childNodes) if (nested.nodeName === 'UL' || nested.nodeName === 'OL') collect(nested);
        } else if (child.nodeName === 'UL' || child.nodeName === 'OL') collect(child);
        else { const text = oneLine([child]); if (text) items.push(text); }
      }
    };
    collect(node);
    return items.length ? items.map((text, i) => (start ? (start + i) + '. ' : '- ') + text).join('\n') : null;
  }
  function table(node) {
    const rows = [];
    const visit = n => {
      for (const child of n.childNodes || []) {
        if (child.nodeName === 'TR') rows.push(Array.from(child.childNodes).filter(c => c.nodeName === 'TH' || c.nodeName === 'TD'));
        else if (child.nodeType === ELEMENT) visit(child);
      }
    };
    visit(node);
    if (!rows.length) return null;
    const width = Math.max(...rows.map(r => r.length), 1);
    const line = cells => '| ' + Array.from({length: width}, (_, i) => cells[i] ? oneLine(cells[i].childNodes) : '').join(' | ') + ' |';
    return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
  }

  function htmlToMarkdown(root) {
    const out = [];
    blocks(root, out);
    return out.filter(text => text !== null && text !== '').join('\n\n');
  }

  LW.htmlToMarkdown = htmlToMarkdown;
})();
