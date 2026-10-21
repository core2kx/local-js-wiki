/* LocalWiki — ui/problems.js
   The "Problems found while opening" dialog and the "⚠ N load problems" sidebar button that
   reopens it. The problems themselves are collected by storage.readFolderContents.

   Depends on: state.js, ui/elements.js
   Provides:   LocalWiki.ui.renderProblems, showProblems, installProblems */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const state = LW.state;

  function renderProblems() {
    const problems = state.loadProblems;
    els.problemsButton.hidden = !problems.length;
    els.problemsButton.textContent = '⚠   ' + problems.length + ' load problem' + (problems.length === 1 ? '' : 's');
    els.problemsList.replaceChildren(...problems.map(({file, message}) => {
      const item = document.createElement('li');
      const name = document.createElement('code'); name.textContent = file;
      item.append(name, ' ', message);
      return item;
    }));
  }
  function showProblems() { renderProblems(); if (state.loadProblems.length) els.problemsDialog.showModal(); }

  function installProblems() {
    els.problemsButton.addEventListener('click', showProblems);
    els.problemsClose.addEventListener('click', () => els.problemsDialog.close());
    els.problemsOk.addEventListener('click', () => els.problemsDialog.close());
  }

  Object.assign(ui, {renderProblems, showProblems, installProblems});
})();
