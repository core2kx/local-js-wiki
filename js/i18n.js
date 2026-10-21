/* LocalWiki — i18n.js
   Interface languages (the text of buttons, menus and messages; page content is never translated).

   A language is a JSON file (see languages/en.json, the master and template):
     { "language": {"code": "sv", "name": "Svenska", "direction": "ltr"},
       "strings":  {"top.open": "Öppna mapp", "count.pages": {"one": "{count} sida", "other": "{count} sidor"}, ...},
       "notes":    {"top.open": "button; keep short"}            (English file only: context for translators)
     }
   - Keys are the same in every language; English is the fallback for anything missing or empty.
   - {name} placeholders are replaced from the params passed to t(). A string can be an object of
     plural forms (zero, one, two, few, many, other) chosen with the "count" param (Intl.PluralRules).
   - **bold** in a string is rendered as bold by the screen code (ui/language.js); nothing else is markup.
   - Built-in languages are registered by js/lang/<code>.js (generated from languages/<code>.json by
     tools/build-languages.js); added languages are registered from files (js/languages.js).

   Pure: no page access; runs under Node.
   Depends on: nothing.
   Provides:   LocalWiki.i18n */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const BASE = 'en';
  const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

  const languages = new Map(); // code -> {code, name, direction, strings, notes, custom}: what is in use
  const builtIns = new Map();  // code -> the built-in entry, kept when an added language overrides it
  let current = BASE;

  // --- Registry -----------------------------------------------------------------------------------
  // file: {language: {code, name, direction}, strings, notes?}. custom: added by a user (not built in).
  function register(file, {custom = false} = {}) {
    const code = String(file.language.code).toLowerCase();
    const entry = {
      code, name: file.language.name || code, direction: file.language.direction === 'rtl' ? 'rtl' : 'ltr',
      strings: file.strings || {}, notes: file.notes || {}, custom
    };
    if (!custom) builtIns.set(code, entry);
    languages.set(code, entry);
    return code;
  }
  // Removes an added language; a built-in language it overrode comes back. Built-in ones stay.
  function unregister(code) {
    code = String(code).toLowerCase();
    if (!languages.get(code)?.custom) return;
    if (builtIns.has(code)) languages.set(code, builtIns.get(code));
    else { languages.delete(code); if (current === code) current = BASE; }
  }
  const has = code => languages.has(String(code).toLowerCase());
  const get = code => languages.get(String(code).toLowerCase()) || null;
  // [{code, name, direction, custom}], English first, then by name.
  function list() {
    return [...languages.values()].map(({code, name, direction, custom}) => ({code, name, direction, custom}))
      .sort((a, b) => (a.code === BASE ? -1 : b.code === BASE ? 1 : a.name.localeCompare(b.name)));
  }
  function setLanguage(code) { current = has(code) ? String(code).toLowerCase() : BASE; return current; }
  const language = () => current;
  // The code to give Intl (dates, numbers, plural rules).
  const locale = () => current;
  // The language to start in: the first of the browser's preferred languages that is registered.
  // Norwegian variants (no, nn) map to Bokmål (nb).
  function detect(preferred = []) {
    for (const tag of preferred) {
      const primary = String(tag).toLowerCase().split('-')[0];
      const code = primary === 'no' || primary === 'nn' ? 'nb' : primary;
      if (has(code)) return code;
    }
    return BASE;
  }

  // --- Translating --------------------------------------------------------------------------------
  function lookup(key) {
    for (const code of [current, BASE]) {
      const value = languages.get(code)?.strings[key];
      if (value !== undefined && value !== '' && value !== null) return {value, code};
    }
    return null;
  }
  function pluralForm(code, count) {
    try { return new Intl.PluralRules(code).select(count); } catch (_) { return count === 1 ? 'one' : 'other'; }
  }
  // Param values: numbers formatted for the language (1 234); {key, params} translated; arrays
  // translated and joined; anything else as text.
  function paramText(value) {
    if (typeof value === 'number') return value.toLocaleString(locale());
    if (Array.isArray(value)) return value.map(paramText).join('; ');
    if (value && typeof value === 'object' && typeof value.key === 'string') return t(value.key, value.params);
    return String(value);
  }
  function t(key, params = {}) {
    const found = lookup(key);
    if (!found) return key; // a missing key is a bug; showing it makes it findable
    let text = found.value;
    if (typeof text === 'object') {
      const form = pluralForm(found.code, Number(params.count));
      text = text[form] ?? text.other ?? text[PLURAL_FORMS.find(f => text[f] !== undefined)] ?? key;
    }
    return String(text).replace(/\{(\w+)\}/g, (literal, name) => (params[name] === undefined ? literal : paramText(params[name])));
  }
  // An Error that carries a translatable message: throw error('err.no_wiki_json').
  class KeyError extends Error {
    constructor(key, params = {}) { super(key); this.name = 'KeyError'; this.key = key; this.params = params; }
  }
  const error = (key, params) => new KeyError(key, params);
  // The text of any error: translated for KeyErrors, the browser's message otherwise.
  const describeError = err => (err && typeof err.key === 'string' && err.name === 'KeyError' ? t(err.key, err.params) : String(err?.message ?? err));

  // --- Language files -----------------------------------------------------------------------------
  const placeholdersOf = value => new Set(
    (typeof value === 'object' ? Object.values(value) : [value]).flatMap(text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1])));
  const validValue = value => (typeof value === 'string' ||
    (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length &&
     Object.entries(value).every(([form, text]) => PLURAL_FORMS.includes(form) && typeof text === 'string')));
  const isEmpty = value => (typeof value === 'string' ? value.trim() === '' : Object.values(value).every(text => text.trim() === ''));

  // Turns a JSON error ("... at position 86") into one that also says line and column.
  function describeSyntaxError(err, text) {
    const position = /position (\d+)/.exec(err.message);
    if (!position || /line \d+/.test(err.message)) return err.message;
    const before = text.slice(0, Number(position[1])).split('\n');
    return `${err.message} (line ${before.length}, column ${before[before.length - 1].length + 1})`;
  }
  // Checks a language file (its text, or an already parsed object).
  // Returns {file, errors, warnings, total, translated, missing}:
  //   errors   [{key, params}]  the file cannot be used (file is null)
  //   warnings [{key, params}]  things to fix; the rest of the file is still used
  //   file     the cleaned file {language, strings}: unknown, malformed and empty entries removed
  //   total/translated/missing  how many of the English texts the file covers
  function parseFile(input) {
    const result = {file: null, errors: [], warnings: [], total: 0, translated: 0, missing: []};
    let data = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input.replace(/^﻿/, '')); }
      catch (err) { result.errors.push({key: 'lang.err_json', params: {error: describeSyntaxError(err, input)}}); return result; }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !data.language || typeof data.language !== 'object' ||
        !data.strings || typeof data.strings !== 'object' || Array.isArray(data.strings)) {
      result.errors.push({key: 'lang.err_shape'}); return result;
    }
    const code = String(data.language.code ?? '').trim().toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(code)) { result.errors.push({key: 'lang.err_code'}); return result; }
    if (code === BASE) { result.errors.push({key: 'lang.err_base'}); return result; }
    const name = String(data.language.name ?? '').trim().slice(0, 60) || code;
    const direction = data.language.direction === 'rtl' ? 'rtl' : 'ltr';
    if (direction === 'rtl') result.warnings.push({key: 'lang.warn_rtl'});

    const english = languages.get(BASE).strings;
    const strings = {};
    let unknown = 0, malformed = 0;
    for (const [key, value] of Object.entries(data.strings)) {
      if (!(key in english)) { unknown++; continue; }
      if (!validValue(value)) { malformed++; result.warnings.push({key: 'lang.warn_malformed', params: {key}}); continue; }
      if (isEmpty(value)) continue; // empty means "not translated yet"
      const wanted = placeholdersOf(english[key]), used = placeholdersOf(value);
      const stray = [...used].filter(name => !wanted.has(name));
      if (stray.length) { result.warnings.push({key: 'lang.warn_stray', params: {key, placeholders: stray.map(p => `{${p}}`).join(' ')}}); continue; }
      const absent = [...wanted].filter(name => !used.has(name));
      // Plural forms such as "one page" may leave out {count}; other texts should keep every placeholder.
      if (absent.length && typeof value === 'string') result.warnings.push({key: 'lang.warn_missing_placeholder', params: {key, placeholders: absent.map(p => `{${p}}`).join(' ')}});
      strings[key] = value;
    }
    if (unknown) result.warnings.push({key: 'lang.warn_unknown', params: {count: unknown}});
    result.total = Object.keys(english).length;
    result.missing = Object.keys(english).filter(key => !(key in strings));
    result.translated = result.total - result.missing.length;
    result.file = {language: {code, name, direction}, strings};
    return result;
  }

  // A file to start a new translation from: every English text, ready to be replaced.
  function template() {
    const base = languages.get(BASE);
    return {language: {code: '', name: '', direction: 'ltr'}, strings: {...base.strings}, notes: {...base.notes}};
  }
  // A language as a file to edit: its texts (English where untranslated), the keys still to do,
  // and the notes for translators.
  function exportFile(code) {
    const lang = get(code), base = languages.get(BASE);
    const strings = {}, untranslated = [];
    for (const key of Object.keys(base.strings)) {
      const own = lang?.strings[key];
      if (own === undefined || own === '' || code === BASE) { strings[key] = base.strings[key]; if (code !== BASE) untranslated.push(key); }
      else strings[key] = own;
    }
    const file = {language: {code: lang.code, name: lang.name, direction: lang.direction}, strings};
    if (untranslated.length) file.untranslated = untranslated;
    file.notes = {...base.notes};
    return file;
  }
  // The registered file for a language, for saving (cleaned strings only).
  function fileOf(code) {
    const lang = get(code);
    return lang ? {language: {code: lang.code, name: lang.name, direction: lang.direction}, strings: lang.strings} : null;
  }

  LW.i18n = {
    BASE, register, unregister, has, get, list, setLanguage, language, locale, detect,
    t, error, describeError, KeyError, parseFile, template, exportFile, fileOf
  };
})();
