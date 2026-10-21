/* LocalWiki — text.js
   Unicode-aware text helpers: HTML escaping, filename slugs, title comparison, accent-insensitive
   search folding, and word counting. Works for any script (Latin, Cyrillic, Greek, CJK, RTL, ...).

   Pure functions: no page (DOM) access, so this file also runs under Node for the tests.
   Depends on: nothing.
   Provides:   LocalWiki.text */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }

  // --- Characters ---------------------------------------------------------------------------------
  // A "grapheme" is what a reader sees as one character: a letter plus its accents or vowel signs,
  // an emoji sequence, etc. Cutting text anywhere else can split a character in half.
  const graphemeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
  const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'word'}) : null;
  function graphemes(text) {
    return graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), part => part.segment) : Array.from(text);
  }
  // Nearest grapheme start at or before offset, so snippets never cut a character in half.
  function graphemeBoundary(text, offset) {
    if (offset <= 0 || offset >= text.length) return offset;
    let start = 0;
    for (const char of graphemes(text)) { if (start + char.length > offset) break; start += char.length; }
    return start;
  }
  function wordCount(content) {
    // Word segmentation handles scripts written without spaces (Chinese, Japanese, Thai).
    if (wordSegmenter) { let n = 0; for (const part of wordSegmenter.segment(content)) if (part.isWordLike) n++; return n; }
    return content.trim() ? content.trim().split(/\s+/u).length : 0;
  }

  // --- Slugs (page IDs and filenames) -------------------------------------------------------------
  // Page IDs are slugs of the title in any script; a page's file is always pages/<id>.json.
  // Latin accents are simplified (Café -> cafe); other scripts are kept as-is (Привет -> привет).
  const RESERVED_NAMES = new Set(['con','prn','aux','nul','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9']);
  const SLUG_MAX_CHARS = 60, SLUG_MAX_BYTES = 150; // well under the 255-byte filename limit
  const utf8 = new TextEncoder();
  function slug(value, fallback = 'page') {
    const text = String(value || '').normalize('NFKD').toLowerCase()
      .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
      .normalize('NFC')
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^[-\p{M}]+/u, '');
    // Truncate on whole characters (never splitting a letter from its marks) within the byte budget.
    let base = '', bytes = 0, count = 0;
    for (const char of graphemes(text)) {
      const size = utf8.encode(char).length;
      if (count >= SLUG_MAX_CHARS || bytes + size > SLUG_MAX_BYTES) break;
      base += char; bytes += size; count++;
    }
    base = base.replace(/-+$/, '');
    if (!base) return fallback;
    return RESERVED_NAMES.has(base) ? base + '-page' : base;
  }

  // --- Title comparison ---------------------------------------------------------------------------
  // Case-insensitive key for titles: canonical Unicode form, locale-independent folding
  // (so "Straße"/"STRASSE" and "ΟΔΟΣ"/"οδος" match identically on every machine).
  function titleKey(title) { return String(title).normalize('NFC').toUpperCase().toLowerCase(); }

  // --- Search folding -----------------------------------------------------------------------------
  // Case- and accent-insensitive ("cafe" finds "Café", "αθηνα" finds "Αθήνα").
  // Marks are only stripped from the general diacritics block, so Indic, Thai, Arabic and Hebrew
  // vowel signs still count. Cyrillic keeps й (a distinct letter); only ё is folded to е.
  const SEARCH_LETTERS = {'ø':'o', 'æ':'ae', 'œ':'oe', 'ł':'l', 'đ':'d', 'ð':'d', 'þ':'th'};
  function foldGrapheme(char) {
    const lower = char.normalize('NFC').toUpperCase().toLowerCase();
    if (/^\p{Script=Cyrillic}/u.test(lower)) return lower.replace(/ё/g, 'е');
    return lower.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[øæœłđðþ]/g, c => SEARCH_LETTERS[c]).normalize('NFC');
  }
  // Returns the folded text plus map[i] = offset in the original text of folded character i,
  // so a match in folded text can be highlighted in the original.
  const foldCache = new Map();
  function foldForSearch(text) {
    let result = foldCache.get(text);
    if (result) return result;
    let folded = '', offset = 0;
    const map = [];
    for (const char of graphemes(text)) {
      const f = foldGrapheme(char);
      folded += f;
      for (let k = 0; k < f.length; k++) map.push(offset);
      offset += char.length;
    }
    map.push(text.length);
    result = {folded, map};
    if (foldCache.size > 1000) foldCache.clear();
    foldCache.set(text, result);
    return result;
  }
  function searchFold(text) { return foldForSearch(text).folded; }
  // Original [start, end) for a match at folded index i with folded length n.
  function originalRange({map}, i, n) {
    let j = i + n;
    while (j < map.length - 1 && map[j] === map[j - 1]) j++; // end on a whole original character
    return [map[i], map[j]];
  }

  LW.text = {escapeHtml, graphemes, graphemeBoundary, wordCount, slug, titleKey, foldForSearch, searchFold, originalRange};
})();
