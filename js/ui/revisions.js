/* LocalWiki — ui/revisions.js
   The "Page history" dialog. Tab "This page" lists the open page's saved earlier versions; choosing
   one shows what changed since then (red: only in that version, green: added since) and offers
   "Restore this version". Tab "Deleted pages" lists deleted pages that can be brought back.
   History lives in the linked folder (see revisions.js), so it needs one.

   Depends on: i18n.js, text.js, revisions.js, state.js, pages.js, ui/elements.js
   Provides:   LocalWiki.ui.openRevisions, installRevisions */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;
  const {wordCount} = LW.text;
  const {t, locale, describeError} = LW.i18n;
  const revisions = LW.revisions;
  const CONTEXT = 2; // unchanged lines shown around each change

  let tab = 'page';  // 'page' | 'deleted'
  let items = [];    // what the list shows (see loadPage / loadDeleted)
  let selected = -1;

  const when = iso => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? t('rev.unknown_date') : new Intl.DateTimeFormat(locale(), {dateStyle: 'medium', timeStyle: 'short'}).format(date);
  };

  async function openRevisions() {
    if (!state.folderHandle) {
      ui.toast(t('rev.need_folder'));
      return;
    }
    LW.pages.commitTitle();
    tab = LW.store.currentPage() ? 'page' : 'deleted';
    els.revisionsDialog.showModal();
    await load();
  }
  async function load() {
    for (const button of document.querySelectorAll('[data-revisions-tab]')) {
      button.classList.toggle('active', button.dataset.revisionsTab === tab);
      button.setAttribute('aria-pressed', String(button.dataset.revisionsTab === tab));
    }
    items = []; selected = -1;
    els.revisionsList.replaceChildren(message(t('rev.loading')));
    els.revisionsDiff.replaceChildren();
    els.revisionsSummary.textContent = '';
    els.revisionsRestore.disabled = true;
    try {
      if (tab === 'page') await loadPage(); else await loadDeleted();
    } catch (err) {
      console.error(err);
      els.revisionsList.replaceChildren(message(t('rev.error', {error: describeError(err)})));
    }
  }

  // This page: the current version first, then saved versions newest first.
  async function loadPage() {
    const page = LW.store.currentPage();
    els.revisionsTitle.textContent = page ? t('rev.title_page', {title: page.title}) : t('rev.title');
    els.revisionsRestore.textContent = t('rev.restore_version');
    if (!page) { els.revisionsList.replaceChildren(message(t('rev.no_page'))); return; }
    const saved = await revisions.pageRevisions(page.id);
    items = [{current: true, savedAt: page.updatedAt, title: page.title, content: page.content}, ...[...saved].reverse()];
    renderList(item => {
      const words = t('page.words', {count: wordCount(item.content)});
      return [item.current ? t('rev.current') : when(item.savedAt),
        item.title !== page.title ? t('rev.detail_renamed', {title: item.title, words}) : t('rev.detail', {words})];
    });
    if (!saved.length) els.revisionsSummary.textContent = t('rev.none_yet');
    if (items.length > 1) select(1);
  }
  // Deleted pages: the newest saved version of each.
  async function loadDeleted() {
    els.revisionsTitle.textContent = t('rev.tab_deleted');
    els.revisionsRestore.textContent = t('rev.restore_page');
    items = await revisions.deletedPages();
    if (!items.length) { els.revisionsList.replaceChildren(message(t('rev.no_deleted'))); return; }
    renderList(file => [file.revisions[file.revisions.length - 1].title, t('rev.deleted_when', {date: when(file.deletedAt)})]);
    select(0);
  }

  function renderList(describe) {
    els.revisionsList.replaceChildren(...items.map((item, index) => {
      const [main, detail] = describe(item);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'revision-entry';
      const first = document.createElement('span'); first.className = 'revision-main'; first.dir = 'auto'; first.textContent = main;
      const second = document.createElement('span'); second.className = 'revision-detail'; second.dir = 'auto'; second.textContent = detail;
      button.append(first, second);
      button.addEventListener('click', () => select(index));
      const li = document.createElement('li'); li.append(button);
      return li;
    }));
  }
  function select(index) {
    selected = index;
    els.revisionsList.querySelectorAll('.revision-entry').forEach((button, i) => button.classList.toggle('active', i === index));
    const item = items[index];
    if (tab === 'deleted') {
      const revision = item.revisions[item.revisions.length - 1];
      els.revisionsSummary.textContent = t('rev.deleted_summary', {date: when(revision.savedAt)});
      renderLines(revision.content.split('\n').map(text => ({type: 'same', text})), false);
      els.revisionsRestore.disabled = false;
    } else if (item.current) {
      els.revisionsSummary.textContent = t('rev.is_current');
      els.revisionsDiff.replaceChildren();
      els.revisionsRestore.disabled = true;
    } else {
      const current = items[0].content;
      const lines = revisions.diffLines(item.content, current);
      const changed = lines.some(line => line.type !== 'same');
      els.revisionsSummary.textContent = t(changed ? 'rev.changed_summary' : 'rev.same_summary', {date: when(item.savedAt)});
      renderLines(lines, true);
      els.revisionsRestore.disabled = false;
    }
  }
  // collapse: shorten long runs of unchanged lines to a few lines of context.
  function renderLines(lines, collapse) {
    const rows = [];
    const row = (type, text) => {
      const div = document.createElement('div');
      div.className = 'diff-line diff-' + type; div.dir = 'auto';
      div.textContent = (type === 'removed' ? '− ' : type === 'added' ? '+ ' : '  ') + text;
      rows.push(div);
    };
    for (let i = 0; i < lines.length;) {
      if (lines[i].type !== 'same' || !collapse) { row(lines[i].type, lines[i].text); i++; continue; }
      let j = i; while (j < lines.length && lines[j].type === 'same') j++;
      const run = lines.slice(i, j);
      const keepStart = i === 0 ? 0 : CONTEXT, keepEnd = j === lines.length ? 0 : CONTEXT;
      if (run.length > keepStart + keepEnd + 1) {
        run.slice(0, keepStart).forEach(line => row('same', line.text));
        const gap = document.createElement('div'); gap.className = 'diff-gap';
        gap.textContent = t('rev.gap', {count: run.length - keepStart - keepEnd});
        rows.push(gap);
        run.slice(run.length - keepEnd).forEach(line => row('same', line.text));
      } else run.forEach(line => row('same', line.text));
      i = j;
    }
    els.revisionsDiff.replaceChildren(...rows);
  }
  function message(text) {
    const li = document.createElement('li'); li.className = 'revision-message'; li.textContent = text; return li;
  }
  function restoreSelected() {
    const item = items[selected];
    if (!item) return;
    els.revisionsDialog.close();
    if (tab === 'deleted') LW.pages.restoreDeleted(item);
    else if (!item.current) LW.pages.restoreRevision(item);
  }

  function installRevisions() {
    els.historyButton.addEventListener('click', openRevisions);
    for (const button of document.querySelectorAll('[data-revisions-tab]')) button.addEventListener('click', () => { tab = button.dataset.revisionsTab; load(); });
    els.revisionsRestore.addEventListener('click', restoreSelected);
    els.revisionsClose.addEventListener('click', () => els.revisionsDialog.close());
    els.revisionsCancel.addEventListener('click', () => els.revisionsDialog.close());
  }

  Object.assign(ui, {openRevisions, installRevisions});
})();
