/* LocalWiki — ui/elements.js
   Looks up every HTML element the app uses (ids are defined in index.html), once, in one place.
   Only ui/*.js and app.js use these; lower layers never touch the page directly.

   Depends on: index.html (scripts are loaded with "defer", so the page is parsed before this runs).
   Provides:   LocalWiki.els */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const $ = id => document.getElementById(id);

  LW.els = {
    // Top bar
    brand: $('brand'), brandIcon: $('brand-icon'), brandName: $('brand-name'), favicon: $('favicon'),
    name: $('wiki-name'), status: $('save-status'), open: $('open-btn'), save: $('save-btn'),
    undo: $('undo-btn'), redo: $('redo-btn'), theme: $('theme-btn'), languageButton: $('language-btn'),
    // Sidebar
    search: $('search'), sidebarHeading: $('sidebar-heading'), nav: $('page-nav'), newPage: $('new-page-btn'),
    newWiki: $('new-wiki-btn'), saveAs: $('save-as-btn'), exportZip: $('export-zip-btn'),
    settingsButton: $('settings-btn'), fileLabel: $('file-label'), problemsButton: $('problems-btn'),
    // Page header and metadata
    empty: $('empty-state'), emptyCreate: $('empty-create-btn'), mainPage: document.querySelector('.page-wrap'),
    breadcrumbs: $('breadcrumbs'), pageWidth: $('page-width-select'), newChild: $('new-child-btn'), del: $('delete-page-btn'),
    historyButton: $('history-btn'),
    pageIconButton: $('page-icon-btn'), pageIconDisplay: $('page-icon-display'), title: $('page-title'),
    modified: $('page-modified'), count: $('page-word-count'), parent: $('parent-select'), tags: $('tags-input'),
    // Editor
    card: $('editor-content'), toolbar: $('editor-toolbar'), content: $('content-input'),
    visual: $('visual-editor'), visualContext: $('visual-context'),
    symbolsButton: $('symbols-btn'), iconsButton: $('icons-btn'), pageId: $('page-id-short'),
    // Table dialog
    tableDialog: $('table-dialog'), tableTitle: $('table-dialog-title'), tableGrid: $('table-builder-grid'),
    tableSize: $('table-size'), tableConfirm: $('table-confirm'), tableCancel: $('table-cancel'), tableClose: $('table-close'),
    tableAddRow: $('table-add-row'), tableRemoveRow: $('table-remove-row'),
    tableAddCol: $('table-add-col'), tableRemoveCol: $('table-remove-col'),
    // Icon/symbol picker dialog
    pickerDialog: $('picker-dialog'), pickerSearch: $('picker-search'), pickerResults: $('picker-results'),
    pickerClear: $('picker-clear'), pickerHint: $('picker-hint'), pickerClose: $('picker-close'), pickerCancel: $('picker-cancel'),
    // Link dialog
    linkDialog: $('link-dialog'), linkTitle: $('link-title'), linkClose: $('link-close'), linkWikiPanel: $('link-wiki-panel'),
    linkSearch: $('link-search'), linkWebPanel: $('link-web-panel'), linkUrl: $('link-url'), linkText: $('link-text'),
    linkList: $('link-list'), linkError: $('link-error'), linkHint: $('link-hint'), linkCancel: $('link-cancel'),
    linkConfirm: $('link-confirm'),
    // Page history dialog
    revisionsDialog: $('revisions-dialog'), revisionsTitle: $('revisions-title'), revisionsList: $('revisions-list'),
    revisionsSummary: $('revisions-summary'), revisionsDiff: $('revisions-diff'), revisionsRestore: $('revisions-restore'),
    revisionsClose: $('revisions-close'), revisionsCancel: $('revisions-cancel'),
    // Wiki settings dialog
    settingsDialog: $('settings-dialog'), settingsClose: $('settings-close'), settingsWikiName: $('settings-wiki-name'),
    settingsAppName: $('settings-app-name'), settingsIconPreview: $('settings-icon-preview'),
    settingsIconChoose: $('settings-icon-choose'), settingsIconUpload: $('settings-icon-upload'),
    settingsIconReset: $('settings-icon-reset'), settingsIconFile: $('settings-icon-file'),
    settingsPalettes: $('settings-palettes'), settingsCancel: $('settings-cancel'), settingsSave: $('settings-save'),
    // Language dialog
    languageDialog: $('language-dialog'), languageClose: $('language-close'), languageList: $('language-list'),
    languageAdd: $('language-add'), languageTemplate: $('language-template'), languageExport: $('language-export'),
    languageFile: $('language-file'), languageResult: $('language-result'), languageDone: $('language-done'),
    // Folder-access help dialog
    folderHelpDialog: $('folder-help-dialog'), folderHelpTitle: $('folder-help-title'), folderHelpBrave: $('folder-help-brave'),
    folderHelpOther: $('folder-help-other'), folderHelpFlag: $('folder-help-flag'), folderHelpCopy: $('folder-help-copy'),
    folderHelpReadOnly: $('folder-help-readonly'), folderHelpExport: $('folder-help-export'),
    folderHelpClose: $('folder-help-close'), folderHelpCloseX: $('folder-help-x'),
    // Load-problems dialog
    problemsDialog: $('problems-dialog'), problemsList: $('problems-list'),
    problemsClose: $('problems-close'), problemsOk: $('problems-ok'),
    // Hidden folder input (read-only fallback) and notifications
    folderInput: $('folder-input'), toast: $('toast')
  };
})();
