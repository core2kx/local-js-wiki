/* LocalWiki — ui/picker.js
   The icon / symbol / emoji picker dialog. Used two ways: inserting into the page text at the
   caret (icons become ":icon[name]:", symbols and emoji are plain Unicode), or choosing the
   page's own icon (shown beside the title and in the sidebar).

   Depends on: text.js, icon-library.js, state.js, pages.js, ui/elements.js, ui/editor.js
   Provides:   LocalWiki.ui.openPicker, installPicker */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {searchFold} = LW.text;
  const icons = LW.icons;

  const SYMBOLS = [
    ['✓','Check mark'], ['✔','Heavy check'], ['✕','Cross'], ['☐','Checkbox empty'], ['☑','Checkbox checked'],
    ['★','Filled star'], ['☆','Empty star'], ['●','Filled circle'], ['○','Empty circle'], ['◆','Diamond'],
    ['→','Arrow right'], ['←','Arrow left'], ['↑','Arrow up'], ['↓','Arrow down'], ['↔','Arrow both ways'],
    ['⇒','Double arrow'], ['↳','Return arrow'], ['∞','Infinity'], ['≈','Approximately'], ['≠','Not equal'],
    ['≤','Less than equal'], ['≥','Greater than equal'], ['±','Plus minus'], ['×','Multiply'], ['÷','Divide'],
    ['°','Degree'], ['µ','Micro'], ['Ω','Ohm'], ['Δ','Delta'], ['π','Pi'], ['Σ','Sigma'], ['∑','Summation'],
    ['§','Section'], ['¶','Paragraph'], ['©','Copyright'], ['®','Registered'], ['™','Trademark'],
    ['€','Euro'], ['£','Pound'], ['¥','Yen'], ['•','Bullet'], ['…','Ellipsis'], ['—','Em dash'],
    ['–','En dash'], ['⚠','Warning'], ['ℹ','Information'], ['⌘','Command'], ['⏎','Return'], ['⌫','Backspace'],
    ['⏻','Power'], ['⏱','Stopwatch']
  ];
  const EMOJI = [
    ['📌','Pin'], ['📄','Document'], ['📁','Folder'], ['📚','Books'], ['🔧','Wrench'], ['⚙️','Settings'],
    ['💻','Computer'], ['🖥️','Desktop'], ['🗄️','Cabinet'], ['📡','Antenna'], ['🌐','Network'],
    ['🛡️','Shield'], ['🔒','Locked'], ['🔓','Unlocked'], ['✅','Complete'], ['❌','Error'], ['⚠️','Warning'],
    ['🚀','Rocket'], ['🧪','Test'], ['📝','Notes'], ['💡','Idea'], ['📅','Calendar'], ['⏰','Alarm'],
    ['🔗','Link'], ['⭐','Star'], ['🎯','Target'], ['📦','Package'], ['🔌','Plug'], ['🔋','Battery'],
    ['🚨','Alert'], ['🛰️','Satellite'], ['🖨️','Printer'], ['🧭','Compass'], ['🔍','Search'],
    ['🧱','Building blocks'], ['📊','Chart'], ['📋','Clipboard'], ['🏷️','Tag'], ['👤','Person']
  ];

  let pickerTarget = 'body'; // 'body' inserts into the text; 'page' sets the page icon
  let pickerTab = 'icons';   // 'icons' | 'symbols' | 'emoji'
  let pickerCaret = 0;       // caret position when the picker opened (focus moves to the dialog)

  function pickerEntries() {
    if (pickerTab === 'icons') return icons.items.map(item => ({name:item.name, label:item.label, glyph:'icon:' + item.name}));
    return (pickerTab === 'symbols' ? SYMBOLS : EMOJI).map(([glyph,label]) => ({name: glyph, label, glyph}));
  }
  function renderPicker() {
    for (const tab of document.querySelectorAll('[data-picker-tab]')) {
      tab.classList.toggle('active', tab.dataset.pickerTab === pickerTab);
      tab.setAttribute('aria-pressed', String(tab.dataset.pickerTab === pickerTab));
    }
    const query = searchFold(els.pickerSearch.value.trim());
    const entries = pickerEntries().filter(item => searchFold(item.label).includes(query) || searchFold(item.name).includes(query));
    els.pickerResults.replaceChildren();
    if (!entries.length) {
      const message = document.createElement('div'); message.className = 'picker-empty'; message.textContent = 'No matching items.';
      els.pickerResults.append(message);
    }
    for (const item of entries) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'picker-item'; button.title = item.label;
      const glyph = document.createElement('span'); glyph.className = 'picker-glyph';
      if (item.glyph.startsWith('icon:')) glyph.innerHTML = icons.svg(item.glyph.slice(5));
      else glyph.textContent = item.glyph;
      const label = document.createElement('span'); label.className = 'picker-label'; label.textContent = item.label;
      button.append(glyph,label);
      button.addEventListener('click', () => {
        if (pickerTarget === 'page') {
          LW.pages.setIcon(item.glyph);
        } else {
          const text = item.glyph.startsWith('icon:') ? ':icon[' + item.glyph.slice(5) + ']:' : item.glyph;
          ui.insertAtCaret(text, pickerCaret);
        }
        els.pickerDialog.close();
      });
      els.pickerResults.append(button);
    }
    els.pickerClear.hidden = pickerTarget !== 'page';
    els.pickerHint.textContent = pickerTarget === 'page' ? 'Choose an icon for this page.' : 'Choose a symbol or icon to insert at the cursor.';
  }
  function openPicker(target = 'body', tab = 'icons') {
    if (!LW.store.currentPage()) return;
    pickerTarget = target; pickerTab = tab;
    pickerCaret = els.content.selectionStart || 0;
    els.pickerSearch.value = '';
    renderPicker();
    els.pickerDialog.showModal();
    els.pickerSearch.focus();
  }

  function installPicker() {
    els.symbolsButton.addEventListener('click', () => openPicker('body', 'symbols'));
    els.iconsButton.addEventListener('click', () => openPicker('body', 'icons'));
    els.pageIconButton.addEventListener('click', () => openPicker('page', 'icons'));
    for (const tab of document.querySelectorAll('[data-picker-tab]')) tab.addEventListener('click', () => {
      pickerTab = tab.dataset.pickerTab; renderPicker();
    });
    els.pickerSearch.addEventListener('input', renderPicker);
    els.pickerClose.addEventListener('click', () => els.pickerDialog.close());
    els.pickerCancel.addEventListener('click', () => els.pickerDialog.close());
    els.pickerClear.addEventListener('click', () => { LW.pages.setIcon(''); els.pickerDialog.close(); });
  }

  Object.assign(ui, {openPicker, installPicker});
})();
