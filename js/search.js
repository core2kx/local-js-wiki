/* LocalWiki — search.js
   Full-text search over titles, tags and page text: query parsing, ranking, and result snippets.
   Matching is case- and accent-insensitive in any script (see text.foldForSearch).

   Query rules: words are matched separately and in any order; "quoted phrases" match exactly
   (an unclosed quote runs to the end, so typing a phrase works). Every term must match.

   Pure functions: no page (DOM) access; runs under Node. The sidebar turns snippets into HTML.
   Depends on: text.js
   Provides:   LocalWiki.search */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const {searchFold, foldForSearch, originalRange, graphemes, graphemeBoundary} = LW.text;

  function searchTerms(raw) {
    const terms = [];
    for (const [, phrase, word] of raw.matchAll(/"([^"]*)"?|(\S+)/g)) {
      const term = searchFold((phrase ?? word).trim().replace(/\s+/g, ' '));
      if (term && !terms.includes(term)) terms.push(term);
    }
    return terms;
  }
  // The whole query as one phrase (quotes ignored), for ranking exact and side-by-side matches.
  function queryPhrase(raw) { return searchFold(raw.replace(/"/g, ' ').trim().replace(/\s+/g, ' ')); }

  // Score: per term, title 3 > tags 2 > text 1; null when some term matches nowhere.
  function scorePage(p, terms, phrase) {
    const title = searchFold(p.title);
    const tags = searchFold(p.tags.join(' '));
    const body = foldForSearch(p.content);
    let score = 0;
    for (const term of terms) {
      const best = title.includes(term) ? 3 : tags.includes(term) ? 2 : body.folded.includes(term) ? 1 : 0;
      if (!best) return null;
      score += best;
    }
    // Rank an exact title match first, and pages containing the words side by side above scattered ones.
    if (title === phrase) score += 10;
    else if (terms.length > 1 && (title.includes(phrase) || body.folded.includes(phrase))) score += 1;
    return {p, score, body};
  }

  // Matching pages, best first: {terms, phrase, matches: [{p, score, body}]}.
  function searchPages(pages, raw) {
    const terms = searchTerms(raw);
    const phrase = queryPhrase(raw);
    const matches = !terms.length ? [] : pages.map(p => scorePage(p, terms, phrase))
      .filter(Boolean).sort((a,b) => b.score - a.score || a.p.title.localeCompare(b.p.title));
    return {terms, phrase, matches};
  }

  // A short excerpt of the page text around the best match, as [{text, mark}] parts where
  // mark=true parts are matched words to highlight. Falls back to tags or the start of the page.
  function snippetParts(p, body, terms, phrase) {
    const text = p.content;
    const ranges = [];
    for (const term of terms) {
      for (let i = body.folded.indexOf(term), n = 0; i >= 0 && n < 50; i = body.folded.indexOf(term, i + term.length), n++) {
        ranges.push(originalRange(body, i, term.length));
      }
    }
    if (!ranges.length) {
      const cleaned = text.replace(/[#*`\[\]|]/g, '').replace(/\s+/g, ' ');
      return [{text: p.tags.join(', ') || graphemes(cleaned).slice(0, 85).join(''), mark: false}];
    }
    // Centre on the words side by side if they occur that way, otherwise on the earliest match.
    const at = terms.length > 1 ? body.folded.indexOf(phrase) : -1;
    const anchor = at >= 0 ? originalRange(body, at, phrase.length)[0] : Math.min(...ranges.map(r => r[0]));
    const from = graphemeBoundary(text, Math.max(0, anchor - 30));
    const to = graphemeBoundary(text, Math.min(text.length, anchor + 110));
    const visible = ranges.map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
      .filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0]);
    const clean = value => value.replace(/\s+/g, ' ');
    const parts = [{text: from > 0 ? '…' : '', mark: false}];
    let cursor = from;
    for (const [start, end] of visible) {
      if (end <= cursor) continue; // overlaps a highlight already shown
      const begin = Math.max(start, cursor);
      parts.push({text: clean(text.slice(cursor, begin)), mark: false}, {text: text.slice(begin, end), mark: true});
      cursor = end;
    }
    parts.push({text: clean(text.slice(cursor, to)) + (to < text.length ? '…' : ''), mark: false});
    return parts;
  }

  LW.search = {searchTerms, queryPhrase, scorePage, searchPages, snippetParts};
})();
