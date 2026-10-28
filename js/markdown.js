/* LocalWiki — markdown.js
   Everything about the wiki's Markdown dialect: rendering to HTML, finding and writing tables,
   and rewriting [[wiki links]] when a page is renamed.

   The renderer is deliberately a safe, compact subset of Markdown, not a full CommonMark engine.
   All page text is HTML-escaped; the only markup produced is the fixed set of tags below, plus
   SVG icons from the bundled allowlist (icon-library.js). Scripts in page content never run.
   A backslash makes the next character literal (\* shows *, \[\[ shows [[); the visual editor
   relies on this to keep typed characters from turning into formatting (see html-to-markdown.js).
   The visual editor edits this same HTML, so html-to-markdown.js must understand every tag here.

   Pure functions: no page (DOM) access; runs under Node.
   Depends on: text.js, icon-library.js
   Provides:   LocalWiki.markdown */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {escapeHtml} = LW.text;
  const icons = LW.icons;
  const IMAGE_PATH = /^images\/[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]*\.(?:png|jpe?g|gif|webp)$/iu; // see model.js

  // --- Rendering ----------------------------------------------------------------------------------
  // Characters a backslash can make literal.
  const ESCAPABLE = /\\([\\`*_~\[\]|#>+.:{}-])/g;
  // Sizes and colors: :size[large]{text} and :color[red]{text}, which may be nested and may hold other
  // inline formatting. A "}" ends the nearest open one; write \} for a literal brace inside.
  const TEXT_SIZES = ['small', 'large', 'huge'];
  const TEXT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'];
  function styledSpans(s, protect) {
    const frames = [], open = [];
    const re = /:(size|color)\[([a-z]+)\]\{|\}/g;
    for (let m; (m = re.exec(s));) {
      if (m[0] === '}') { const frame = open.pop(); if (frame) frame.close = m.index; continue; }
      const valid = (m[1] === 'size' ? TEXT_SIZES : TEXT_COLORS).includes(m[2]);
      const frame = {start: m.index, end: m.index + m[0].length, close: -1, cls: valid ? 'text-' + m[2] : null};
      frames.push(frame); open.push(frame);
    }
    const edits = [];
    for (const f of frames) if (f.cls && f.close >= 0) edits.push([f.start, f.end, protect('<span class="' + f.cls + '">')], [f.close, f.close + 1, protect('</span>')]);
    if (!edits.length) return s;
    edits.sort((a, b) => a[0] - b[0]);
    let out = '', at = 0;
    for (const [from, to, html] of edits) { out += s.slice(at, from) + html; at = to; }
    return out + s.slice(at);
  }
  // options.linkExists(target) tells whether a [[target]] resolves to a page (missing links are styled);
  // options.imageUrl(path) gives the address to show a picture from (null: the picture is missing).
  function inlineMarkdown(input, options) {
    // Code spans, icons and links are rendered first and swapped for placeholders, so the
    // emphasis rules below cannot reach inside them.
    const tokens = [];
    const protect = html => { const n = tokens.push(html) - 1; return '' + n + ''; };
    let s = String(input);
    s = s.replace(ESCAPABLE, (_m, ch) => protect(escapeHtml(ch)));
    // Code spans: `code`, or ``code with ` inside`` (one space inside the ticks is padding).
    s = s.replace(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (_m, _ticks, code) =>
      protect('<code>' + escapeHtml(/^ .* $/.test(code) && code.trim() ? code.slice(1, -1) : code) + '</code>'));
    s = s.replace(/:icon\[([a-z0-9-]+)\]:/g, (literal, name) => icons.has(name)
      ? protect('<span class="inline-wiki-icon" role="img" aria-label="' + escapeHtml(name) + '" data-icon="' + escapeHtml(name) + '">' + icons.svg(name) + '</span>')
      : literal);
    // Pictures from the wiki folder only (nothing is ever loaded from the web):
    // ![description](images/name.png) with an optional {width=25%|50%|75%}.
    s = s.replace(/!\[([^\]\n]*)\]\((images\/[^\s)]+)\)(?:\{width=(25|50|75|100)%\})?/g, (literal, alt, path, width) => {
      if (!IMAGE_PATH.test(path)) return literal;
      const url = options.imageUrl ? options.imageUrl(path) : null;
      const attributes = ' data-image="' + escapeHtml(path) + '" data-alt="' + escapeHtml(alt) + '"' + (width && width !== '100' ? ' data-width="' + width + '"' : '');
      return protect(url
        ? '<img class="page-image" src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '"' + attributes + '>'
        : '<span class="page-image-missing" contenteditable="false"' + attributes + '>' + escapeHtml(alt || path) + '</span>');
    });
    s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_m, descriptor) => {
      const sep = descriptor.indexOf('|');
      const target = (sep < 0 ? descriptor : descriptor.slice(0, sep)).trim();
      const label = (sep < 0 ? target : descriptor.slice(sep + 1)).trim();
      const missing = !options.linkExists(target);
      return protect('<a href="#" class="wiki-link' + (missing ? ' missing-link' : '') + '" data-wiki-target="' + escapeHtml(target) + '">' + escapeHtml(label || target) + '</a>');
    });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_m, label, url) =>
      protect('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>'));
    s = styledSpans(s, protect);
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s.replace(/(\d+)/g, (_m, index) => tokens[Number(index)] || '');
  }
  function blockStart(lines, i) {
    const x = lines[i] || '';
    return /^\s*$/.test(x) || /^\s*```/.test(x) || /^#{1,6}\s+/.test(x) || /^\s*(?:[-*+] |\d+\. )/.test(x) || /^\s*>/.test(x) || /^\s*(?:---+|\*\*\*+)\s*$/.test(x) ||
      (x.includes('|') && i + 1 < lines.length && tableDivider(lines[i + 1]));
  }
  function toHtml(source, options) {
    const inline = text => inlineMarkdown(text, options);
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*```/.test(line)) {
        i++;
        const code = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        if (i < lines.length) i++;
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 4);
        out.push(`<h${level} dir="auto">${inline(heading[2])}</h${level}>`); i++; continue;
      }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (line.includes('|') && i + 1 < lines.length && tableDivider(lines[i + 1])) {
        const headers = cells(line); i += 2;
        let table = '<table><thead><tr>' + headers.map(c => '<th dir="auto">' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const values = cells(lines[i++]);
          table += '<tr>' + headers.map((_h, j) => '<td dir="auto">' + inline(values[j] || '') + '</td>').join('') + '</tr>';
        }
        out.push('<div class="table-block"><div class="table-scroll">' + table + '</tbody></table></div></div>'); continue;
      }
      const listType = /^\s*[-*+] /.test(line) ? 'ul' : /^\s*\d+\. /.test(line) ? 'ol' : null;
      if (listType) {
        // A numbered list keeps its first number (e.g. steps continued after a code block).
        const start = listType === 'ol' ? parseInt(line, 10) : 1;
        const items = [];
        const itemRE = listType === 'ul' ? /^\s*[-*+] (.*)$/ : /^\s*\d+\. (.*)$/;
        while (i < lines.length && itemRE.test(lines[i])) {
          const item = lines[i++].match(itemRE)[1];
          items.push('<li dir="auto">' + inline(item) + '</li>');
        }
        out.push('<' + listType + (start !== 1 ? ' start="' + start + '"' : '') + '>' + items.join('') + '</' + listType + '>'); continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote dir="auto">' + inline(quote.join(' ')) + '</blockquote>'); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && !blockStart(lines, i)) paragraph.push(lines[i++]);
      out.push('<p dir="auto">' + paragraph.map(inline).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  // --- Tables -------------------------------------------------------------------------------------
  // Cells of one table row; "\|" is a literal pipe inside a cell.
  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
  }
  // The "| --- | --- |" line under a table header.
  function tableDivider(line) {
    const c = cells(line);
    return c.length > 0 && c.every(x => /^:?-{3,}:?$/.test(x));
  }
  // The table containing line lineIndex of text: {startLine, endLine (exclusive), values: rows of cells}.
  function findTableAt(text, lineIndex) {
    const lines = text.replace(/\r\n?/g,'\n').split('\n');
    for (let i = 0; i + 1 < lines.length; i++) {
      if (!lines[i].includes('|') || !tableDivider(lines[i + 1])) continue;
      let j = i + 2;
      while (j < lines.length && lines[j].trim() && lines[j].includes('|')) j++;
      if (lineIndex >= i && lineIndex < j) {
        const columns = cells(lines[i]).length;
        const values = [cells(lines[i])];
        for (let k = i+2; k < j; k++) values.push(cells(lines[k]));
        return {startLine:i, endLine:j, values:values.map(row => Array.from({length:columns}, (_, col) => row[col] || ''))};
      }
      i = j-1;
    }
    return null;
  }
  // Character offset where line n starts.
  function lineOffset(lines, n) {
    let position = 0;
    for (let i=0; i<n; i++) position += lines[i].length + 1;
    return position;
  }
  // Rows of cells (first row = header) as Markdown table text.
  function tableMarkdown(values) {
    const encode = value => String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
    const row = cells => '| ' + cells.map(encode).join(' | ') + ' |';
    return [row(values[0]), row(values[0].map(() => '---')), ...values.slice(1).map(row)].join('\n');
  }

  // --- Writing links ------------------------------------------------------------------------------
  // The Markdown for a link. kind 'wiki': [[target]] or [[target|label]]; kind 'web': [label](address).
  // Characters that would break the syntax are replaced by spaces.
  const tidy = text => String(text || '').replace(/[\[\]|\n]/g, ' ').replace(/\s+/g, ' ').trim();
  function linkMarkdown(kind, target, label) {
    if (kind === 'wiki') {
      const to = tidy(target), text = tidy(label);
      return '[[' + to + (text && text !== to ? '|' + text : '') + ']]';
    }
    const address = String(target).trim().replace(/\s/g, '%20').replace(/\)/g, '%29');
    return '[' + (tidy(label) || address) + '](' + address + ')';
  }
  // A web address the wiki can link to: http, https or mailto. "example.com" gets https:// added.
  // Returns the cleaned address, or null if it is not one.
  function webAddress(text) {
    const value = String(text || '').trim();
    if (/^(https?:\/\/|mailto:)\S+$/i.test(value)) return value;
    if (/^[^\s/@:]+\.[^\s/@:]{2,}(\/\S*)?$/.test(value)) return 'https://' + value;
    return null;
  }

  // --- Link rewriting -----------------------------------------------------------------------------
  // Rewrites [[target]] and [[target|label]] links outside code. isTarget(target) returns a truthy
  // "kind" for links to rewrite; newTarget(kind) gives the replacement target. Labels are kept.
  function rewriteLinks(content, isTarget, newTarget) {
    let inFence = false;
    return content.split('\n').map(line => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
      if (inFence) return line;
      // Odd-indexed parts are inline code spans, which never render as links.
      return line.split(/(`[^`\n]+`)/).map((part, i) => i % 2 ? part :
        part.replace(/\[\[([^\]\n]+)\]\]/g, (literal, descriptor) => {
          const sep = descriptor.indexOf('|');
          const target = (sep < 0 ? descriptor : descriptor.slice(0, sep)).trim();
          const replacement = isTarget(target);
          if (!replacement) return literal;
          return '[[' + newTarget(replacement) + (sep < 0 ? '' : descriptor.slice(sep)) + ']]';
        })).join('');
    }).join('\n');
  }

  LW.markdown = {toHtml, cells, tableDivider, findTableAt, lineOffset, tableMarkdown, linkMarkdown, webAddress, rewriteLinks};
})();
