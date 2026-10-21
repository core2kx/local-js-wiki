/* LocalWiki — ui/picker.js
   The icon / symbol / emoji picker dialog. Used two ways: inserting into the page text at the
   caret (icons become ":icon[name]:", symbols and emoji are plain Unicode), or choosing the
   page's own icon (shown beside the title and in the sidebar), or handing the choice to a caller
   (target 'custom', e.g. the wiki icon in the settings dialog).

   Depends on: i18n.js, text.js, icon-library.js, state.js, pages.js, ui/elements.js, ui/editor.js
   Provides:   LocalWiki.ui.openPicker, installPicker */
(() => {
  'use strict';
  const LW = (globalThis.LocalWiki ||= {});
  const ui = (LW.ui ||= {});
  const els = LW.els;
  const {searchFold} = LW.text;
  const icons = LW.icons;
  const {t} = LW.i18n;

  const SYMBOLS = [
    ['✓','symbol.check_mark'], ['✔','symbol.heavy_check'], ['✕','symbol.cross'], ['☐','symbol.checkbox_empty'], ['☑','symbol.checkbox_checked'],
    ['★','symbol.filled_star'], ['☆','symbol.empty_star'], ['●','symbol.filled_circle'], ['○','symbol.empty_circle'], ['◆','symbol.diamond'],
    ['→','symbol.arrow_right'], ['←','symbol.arrow_left'], ['↑','symbol.arrow_up'], ['↓','symbol.arrow_down'], ['↔','symbol.arrow_both_ways'],
    ['⇒','symbol.double_arrow'], ['↳','symbol.return_arrow'], ['∞','symbol.infinity'], ['≈','symbol.approximately'], ['≠','symbol.not_equal'],
    ['≤','symbol.less_than_equal'], ['≥','symbol.greater_than_equal'], ['±','symbol.plus_minus'], ['×','symbol.multiply'], ['÷','symbol.divide'],
    ['°','symbol.degree'], ['µ','symbol.micro'], ['Ω','symbol.ohm'], ['Δ','symbol.delta'], ['π','symbol.pi'], ['Σ','symbol.sigma'], ['∑','symbol.summation'],
    ['§','symbol.section'], ['¶','symbol.paragraph'], ['©','symbol.copyright'], ['®','symbol.registered'], ['™','symbol.trademark'],
    ['€','symbol.euro'], ['£','symbol.pound'], ['¥','symbol.yen'], ['•','symbol.bullet'], ['…','symbol.ellipsis'], ['—','symbol.em_dash'],
    ['–','symbol.en_dash'], ['⚠','symbol.warning'], ['ℹ','symbol.information'], ['⌘','symbol.command'], ['⏎','symbol.return'], ['⌫','symbol.backspace'],
    ['⏻','symbol.power'], ['⏱','symbol.stopwatch']
  ];
  const EMOJI = [
    ['📌','emoji.pin'], ['📄','emoji.document'], ['📁','emoji.folder'], ['📚','emoji.books'], ['🔧','emoji.wrench'], ['⚙️','emoji.settings'],
    ['💻','emoji.computer'], ['🖥️','emoji.desktop'], ['🗄️','emoji.cabinet'], ['📡','emoji.antenna'], ['🌐','emoji.network'],
    ['🛡️','emoji.shield'], ['🔒','emoji.locked'], ['🔓','emoji.unlocked'], ['✅','emoji.complete'], ['❌','emoji.error'], ['⚠️','emoji.warning'],
    ['🚀','emoji.rocket'], ['🧪','emoji.test'], ['📝','emoji.notes'], ['💡','emoji.idea'], ['📅','emoji.calendar'], ['⏰','emoji.alarm'],
    ['🔗','emoji.link'], ['⭐','emoji.star'], ['🎯','emoji.target'], ['📦','emoji.package'], ['🔌','emoji.plug'], ['🔋','emoji.battery'],
    ['🚨','emoji.alert'], ['🛰️','emoji.satellite'], ['🖨️','emoji.printer'], ['🧭','emoji.compass'], ['🔍','emoji.search'],
    ['🧱','emoji.building_blocks'], ['📊','emoji.chart'], ['📋','emoji.clipboard'], ['🏷️','emoji.tag'], ['👤','emoji.person']
  ];

  let pickerTarget = 'body'; // 'body' inserts into the text; 'page' sets the page icon; 'custom' calls onChoose
  let onChoose = null;
  let pickerTab = 'icons';   // 'icons' | 'symbols' | 'emoji'
  let pickerCaret = 0;       // caret position when the picker opened (focus moves to the dialog)

  function pickerEntries() {
    // Names are looked up by key, so they follow the interface language (and so does searching them).
    if (pickerTab === 'icons') return icons.items.map(item => ({name: item.name, label: t('icon.' + item.name), glyph: 'icon:' + item.name}));
    return (pickerTab === 'symbols' ? SYMBOLS : EMOJI).map(([glyph, key]) => ({name: glyph, label: t(key), glyph}));
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
      const message = document.createElement('div'); message.className = 'picker-empty'; message.textContent = t('picker.none');
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
        if (pickerTarget === 'custom') {
          onChoose?.(item.glyph);
        } else if (pickerTarget === 'page') {
          LW.pages.setIcon(item.glyph);
        } else {
          if (ui.activeSurface() === 'visual') {
            if (item.glyph.startsWith('icon:')) ui.visualInsertIcon(item.glyph.slice(5)); else ui.visualInsertText(item.glyph);
          } else {
            const text = item.glyph.startsWith('icon:') ? ':icon[' + item.glyph.slice(5) + ']:' : item.glyph;
            ui.insertAtCaret(text, pickerCaret);
          }
        }
        els.pickerDialog.close();
      });
      els.pickerResults.append(button);
    }
    els.pickerClear.hidden = pickerTarget !== 'page';
    els.pickerHint.textContent = t(pickerTarget === 'page' ? 'picker.hint_page' : pickerTarget === 'custom' ? 'picker.hint_custom' : 'picker.hint_insert');
  }
  function openPicker(target = 'body', tab = 'icons', choose = null) {
    if (target !== 'custom' && !LW.store.currentPage()) return;
    pickerTarget = target; pickerTab = tab; onChoose = choose;
    pickerCaret = els.content.selectionStart || 0;
    if (ui.activeSurface() === 'visual') ui.saveVisualSelection(); // the dialog takes the focus
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
